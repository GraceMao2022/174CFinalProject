import { tiny, defs } from './examples/common.js';
import { Shape_From_File } from './examples/obj-file-demo.js';

// Pull these names into this module's scope for convenience:
const { vec3, vec4, color, Mat4, Shape, Material, Shader, Texture } = tiny;

const shapes = {
    'sphere': new defs.Subdivision_Sphere(5),
    'cylinder': new defs.Cylindrical_Tube(20, 20, [[0, 0], [0, 0]]),
    'seed': new Shape_From_File("./assets/single_seed.obj"),
    'leaf': new Shape_From_File("./assets/leaf2.obj"),
    'receptacle': new Shape_From_File("./assets/stem_pod.obj"),
    'stem': new Shape_From_File("./assets/stem_segment.obj"),
};

const colors = {
    'green': color(0, 1, 0, 1),
    'white': color(1, 1, 1, 1)
};

export const Dandelion = class Dandelion {
    constructor(ground_pos) {
        this.leaf_texture = {
            shader: new defs.Textured_Phong(), color: color(0, 0, 0, 1),
            ambient: 0.5, diffusivity: .5, specularity: .5, texture: new Texture("assets/dandelion_leafTransp.png", "NPOT")
        };

        // Root setup
        const root_location = Mat4.translation(ground_pos[0], ground_pos[1], ground_pos[2]);
        this.root = new Arc("root", null, null, root_location);
        this.root.set_dof(true, false, true, false, false, false);

        // Stem setup
        this.num_stem_segments = 10;
        this.stem_length = 5;
        this.stem_width = 0.15;
        this.stem_segments = [];
        this.stem_joints = [];
        let final_stem_joint = this.spawn_stem(this.num_stem_segments);

        // Receptacle setup
        this.receptacle_radius = 0.2;
        let receptacle_transform = Mat4.scale(this.receptacle_radius, this.receptacle_radius, this.receptacle_radius)
            .pre_multiply(Mat4.translation(0, this.receptacle_radius, 0));
        this.receptacle_node = new Node("receptacle", shapes.receptacle, receptacle_transform, colors.white);
        final_stem_joint.child_node = this.receptacle_node;
        this.receptacle_node.parent_arc = final_stem_joint;
        final_stem_joint.set_dof(false, false, false, false, false, false);

        // Stem end effector
        const stem_end_effector_pos = vec4(0, 0, 0, 1);
        this.stem_end_effector = new End_Effector("receptacle", final_stem_joint, stem_end_effector_pos);
        final_stem_joint.end_effector = this.stem_end_effector;

        // Stem DOF and theta
        this.stem_dof = this.num_stem_segments * 2;
        this.stem_theta = new Array(this.stem_dof).fill(0);
        this.prev_stem_theta = [...this.stem_theta]; // For WindField damping
        this.apply_theta();

        // Seeds setup
        this.num_seeds = 15;
        this.seed_length = 0.6;
        this.seed_width = 0.6;
        this.seeds = [];
        this.seed_joints = [];
        this.spawn_seeds(this.num_seeds);
    }

    update(dt, wind_field) {
        if (wind_field) {
            wind_field.update(this, dt);
        } else {
            for (let i = 0; i < this.stem_dof; i++) {
                this.stem_theta[i] *= 0.95;
            }
            this.apply_theta();
            for (let seed of this.seeds) {
                if (!seed.detached) {
                    seed.theta_x *= 0.95;
                    seed.theta_y *= 0.95;
                    seed.parent_arc.update_articulation([seed.theta_x, seed.theta_y]);
                }
            }
        }
    }

    spawn_stem(num_segments) {
        const segment_len = this.stem_length / num_segments;
        let parent_arc = this.root;
        for (let i = 0; i < num_segments; i++) {
            const stem_transform = Mat4.scale(this.stem_width, segment_len, this.stem_width)
                .pre_multiply(Mat4.translation(0, segment_len / 2, 0));
            let stem_node = new Node("stem", shapes.stem, stem_transform, colors.green);
            this.stem_segments.push(stem_node);

            parent_arc.child_node = stem_node;
            stem_node.parent_arc = parent_arc;
            this.stem_joints.push(parent_arc);

            const next_joint_location = Mat4.translation(0, segment_len, 0);
            let new_stem_joint = new Arc("stem_joint", stem_node, null, next_joint_location);
            new_stem_joint.set_dof(true, false, true, false, false, false);
            stem_node.children_arcs.push(new_stem_joint);
            parent_arc = new_stem_joint;
        }
        return parent_arc;
    }

    spawn_seeds(num_seeds) {
        let points = this.fibonacci_sphere(num_seeds, this.receptacle_radius);
        for (let i = 0; i < num_seeds; i++) {
            let attach_point = points[i];
            let normal = attach_point.normalized();

            let seed_transform = Mat4.scale(this.seed_width, this.seed_length, this.seed_width)
                .pre_multiply(Mat4.rotation(Math.PI / 2, 1, 0, 0));
            const v = vec3(0, 0, 1);
            const w = v.cross(normal).normalized();
            const theta = Math.acos(v.dot(normal));
            seed_transform.pre_multiply(Mat4.rotation(theta, w[0], w[1], w[2]));
            const seed_pos = normal.times(this.seed_length + 0.2);
            seed_transform.pre_multiply(Mat4.translation(seed_pos[0], seed_pos[1], seed_pos[2]));
            let end_effector_pos = normal.times(this.seed_length);
            end_effector_pos = vec4(end_effector_pos[0], end_effector_pos[1], end_effector_pos[2], 1);
            let seed_node = new Seed("seed", shapes.seed, seed_transform, colors.white, end_effector_pos);
            seed_node.theta_x = 0; // Explicitly initialize
            seed_node.theta_y = 0;
            this.seeds.push(seed_node);

            const attach_joint_location = Mat4.translation(attach_point[0], attach_point[1] + this.receptacle_radius, attach_point[2]);
            let attach_joint = new Arc("attach_joint", this.receptacle_node, seed_node, attach_joint_location);
            this.receptacle_node.children_arcs.push(attach_joint);
            seed_node.parent_arc = attach_joint;
            attach_joint.set_dof(true, true, false, false, false, false);
            this.seed_joints.push(attach_joint);
        }
    }

    fibonacci_sphere(samples, radius) {
        let points = [];
        const phi = Math.PI * (Math.sqrt(5.) - 1.);
        for (let i = 0; i < samples; i++) {
            let y = radius - (i / (samples - 1)) * radius * 2;
            let rad = Math.sqrt(radius * radius - y * y);
            let theta = phi * i;
            let x = Math.cos(theta) * rad;
            let z = Math.sin(theta) * rad;
            points.push(vec3(x, y, z));
        }
        return points;
    }



    apply_theta() {
        for (let i = 0; i < this.num_stem_segments; i++) {
            this.stem_joints[i].update_articulation([this.stem_theta[2 * i], this.stem_theta[2 * i + 1]]);
        }
    }

    draw(webgl_manager, uniforms, material) {
        let leaf_transform = Mat4.translation(0, 1, 0).times(Mat4.scale(2, 2, 2));
        shapes.leaf.draw(webgl_manager, uniforms, leaf_transform, this.leaf_texture);

        this.matrix_stack = [];
        this._rec_draw(this.root, Mat4.identity(), webgl_manager, uniforms, material);
    }

    _rec_draw(arc, matrix, webgl_manager, uniforms, material) {
        if (arc !== null) {
            const L = arc.location_matrix;
            const A = arc.articulation_matrix;
            matrix.post_multiply(L.times(A));
            this.matrix_stack.push(matrix.copy());

            const node = arc.child_node;
            if (node && !node.detached) { // Only draw non-detached nodes
                const T = node.transform_matrix;
                matrix.post_multiply(T);
                node.shape.draw(webgl_manager, uniforms, matrix, { ...material, color: node.color });
            }

            matrix = this.matrix_stack.pop();
            for (const next_arc of node.children_arcs) {
                this.matrix_stack.push(matrix.copy());
                this._rec_draw(next_arc, matrix, webgl_manager, uniforms, material);
                matrix = this.matrix_stack.pop();
            }
        }
    }
};

class Node {
    constructor(name, shape, transform, color) {
        this.name = name;
        this.shape = shape;
        this.transform_matrix = transform;
        this.parent_arc = null;
        this.color = color;
        this.children_arcs = [];
    }

    get_global_transform() {
        let global_transform = this.transform_matrix.copy();
        if (this.parent_arc !== null) {
            global_transform.pre_multiply(this.parent_arc.get_global_transform());
        }
        return global_transform;
    }

    get_global_position() {
        let global_transform = this.get_global_transform();
        return vec3(global_transform[0][3], global_transform[1][3], global_transform[2][3]);
    }
}

class Arc {
    constructor(name, parent, child, location) {
        this.name = name;
        this.parent_node = parent;
        this.child_node = child;
        this.location_matrix = location;
        this.articulation_matrix = Mat4.identity();
        this.end_effector = null;
        this.dof = { Rx: false, Ry: false, Rz: false, Tx: false, Ty: false, Tz: false };
    }

    set_dof(rx, ry, rz, tx, ty, tz) {
        this.dof.Rx = rx;
        this.dof.Ry = ry;
        this.dof.Rz = rz;
        this.dof.Tx = tx;
        this.dof.Ty = ty;
        this.dof.Tz = tz;
    }

    update_articulation(theta) {
        this.articulation_matrix = Mat4.identity();
        let index = 0;
        if (this.dof.Rx) this.articulation_matrix.pre_multiply(Mat4.rotation(theta[index++], 1, 0, 0));
        if (this.dof.Ry) this.articulation_matrix.pre_multiply(Mat4.rotation(theta[index++], 0, 1, 0));
        if (this.dof.Rz) this.articulation_matrix.pre_multiply(Mat4.rotation(theta[index++], 0, 0, 1));
        if (this.dof.Tx) this.articulation_matrix.pre_multiply(Mat4.translation(theta[index++], 0, 0));
        if (this.dof.Ty) this.articulation_matrix.pre_multiply(Mat4.translation(0, theta[index++], 0));
        if (this.dof.Tz) this.articulation_matrix.pre_multiply(Mat4.translation(0, 0, theta[index]));
    }

    get_global_transform() {
        let global_transform = this.location_matrix.times(this.articulation_matrix);
        if (this.parent_node && this.parent_node.parent_arc) {
            global_transform.pre_multiply(this.parent_node.parent_arc.get_global_transform());
        }
        return global_transform;
    }

    get_global_position() {
        let global_transform = this.get_global_transform();
        return vec3(global_transform[0][3], global_transform[1][3], global_transform[2][3]);
    }
}

class End_Effector {
    constructor(name, parent, local_position) {
        this.name = name;
        this.parent = parent;
        this.local_position = local_position;
    }

    get_global_position() {
        return this.parent.get_global_transform().times(this.local_position);
    }
}

class Seed extends Node {
    constructor(name, shape, transform, color, end_effector_pos) {
        super(name, shape, transform, color);
        this.detached = false;
        this.theta_x = 0;
        this.theta_y = 0;
        this.end_effector_local_pos = end_effector_pos;
        this.has_moved = false; // Ensure WindField can initialize prev_pos
        this.prev_pos = vec3(0, 0, 0);
        this.vel = vec3(0, 0, 0);
    }

    get_end_effector_global_position() {
        let pos = this.parent_arc.get_global_transform().times(this.end_effector_local_pos);
        return vec3(pos[0], pos[1], pos[2]);
    }
};