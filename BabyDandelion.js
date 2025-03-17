import { tiny, defs } from './examples/common.js';
import { Shape_From_File } from './examples/obj-file-demo.js';

// Pull these names into this module's scope for convenience:
const { vec3, vec4, color, Mat4, Shape, Material, Shader, Texture, Component } = tiny;

const shapes = {
    'sphere': new defs.Subdivision_Sphere(5),
    'cylinder': new defs.Cylindrical_Tube(20, 20, [[0, 0], [0, 0]]),
    'leaf': new Shape_From_File("./assets/leaf2.obj"),
    'receptacle': new Shape_From_File("./assets/flower.obj"),
    'stem': new Shape_From_File("./assets/stem_segment.obj"),
};

const colors = {
    'green': color(0, 1, 0, 1),
    'white': color(1, 1, 1, 1),
    'yellow': color(1, 1, 0, 1),
}

export
    const BabyDandelion =
        class BabyDandelion {
            constructor(ground_pos, stem_length = 5) {
                // leaf
                this.leaf_texture = {
                    shader: new defs.Textured_Phong(), color: color(0, 0, 0, 1),
                    ambient: 0.5, diffusivity: .5, specularity: .5, texture: new Texture("assets/dandelion_leafTransp.png", "NPOT")
                };
                // make random leaf rotation
                const leaf_rotation = Math.random() * 2 * Math.PI;
                this.leaf_transform = Mat4.translation(ground_pos[0], ground_pos[1] + 1, ground_pos[2]).times(Mat4.rotation(leaf_rotation, 0, 1, 0)).times(Mat4.scale(2, 2, 2));

                // root->stem
                const root_location = Mat4.translation(ground_pos[0], ground_pos[1], ground_pos[2]);
                this.root = new Arc("root", null, null, root_location);
                this.root.set_dof(true, false, true, false, false, false);

                // actual stem
                this.num_stem_segments = 7;
                this.stem_length = stem_length;
                this.stem_width = 0.15;
                this.stem_segments = [];
                this.stem_joints = []; //parent joint
                let final_stem_joint = this.spawn_stem(this.num_stem_segments);

                // receptacle node
                this.receptacle_radius = 0.5;
                let receptacle_transform = Mat4.scale(this.receptacle_radius, this.receptacle_radius, this.receptacle_radius);
                receptacle_transform.pre_multiply(Mat4.translation(0, 0, 0));
                this.receptacle_node = new Node("receptacle", shapes.receptacle, receptacle_transform, colors.yellow);
                // final_stem_joint->receptacle
                final_stem_joint.child_node = this.receptacle_node;
                this.receptacle_node.parent_arc = final_stem_joint;
                final_stem_joint.set_dof(false, false, false, false, false, false);
            }

            update(dt, active_wind_fields) {
                this.applyStemForces(dt, active_wind_fields);
            }

            // Apply spring-damper forces to stem segments
            applyStemForces(dt, active_wind_fields) {
                let receptacle_pos = this.receptacle_node.get_global_position();

                let total_receptacle_force = vec3(0, 0, 0);
                for (let i = 0; i < active_wind_fields.length; i++) {
                    let wind_force = active_wind_fields[i].getWindForce(receptacle_pos, this.receptacle_radius);
                    total_receptacle_force.add_by(wind_force);
                }

                for (let i = 0; i < this.stem_segments.length; i++) {
                    // Get segment properties
                    const segment = this.stem_segments[i];
                    const seg_pos = segment.get_global_position();

                    // vector from segment position to ground attach point
                    const seg_displ_vec = seg_pos.minus(this.root.get_global_position());

                    // if there is wind
                    if (active_wind_fields.length !== 0) {
                        const receptacle_torque = seg_displ_vec.cross(total_receptacle_force);
                        segment.update(dt, receptacle_torque);
                    }
                    else {
                        segment.update(dt, null);
                    }
                }
            }

            draw(webgl_manager, uniforms, material) {
                shapes.leaf.draw(webgl_manager, uniforms, this.leaf_transform, this.leaf_texture);

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
                    const T = node.transform_matrix;
                    matrix.post_multiply(T);
                    node.shape.draw(webgl_manager, uniforms, matrix, { ...material, color: node.color });

                    matrix = this.matrix_stack.pop();
                    for (const next_arc of node.children_arcs) {
                        this.matrix_stack.push(matrix.copy());
                        this._rec_draw(next_arc, matrix, webgl_manager, uniforms, material);
                        matrix = this.matrix_stack.pop();
                    }
                }
            }

            spawn_stem(num_segments) {
                const segment_len = this.stem_length / num_segments;
                let parent_arc = this.root;
                for (let i = 0; i < num_segments; i++) {
                    const stem_transform = Mat4.scale(this.stem_width, segment_len / 2, this.stem_width);
                    stem_transform.pre_multiply(Mat4.translation(0, segment_len / 2, 0));
                    let stem_node = new Stem("stem", shapes.stem, stem_transform, colors.green);
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
        }

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

        if (this.parent_arc !== null)
            global_transform.pre_multiply(this.parent_arc.get_global_transform());

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

        this.dof = {
            Rx: false,
            Ry: false,
            Rz: false,
            Tx: false,
            Ty: false,
            Tz: false
        }
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
        if (this.dof.Rx) {
            this.articulation_matrix.pre_multiply(Mat4.rotation(theta[index], 1, 0, 0));
            index += 1;
        }
        if (this.dof.Ry) {
            this.articulation_matrix.pre_multiply(Mat4.rotation(theta[index], 0, 1, 0));
            index += 1;
        }
        if (this.dof.Rz) {
            this.articulation_matrix.pre_multiply(Mat4.rotation(theta[index], 0, 0, 1));
            index += 1;
        }
        if (this.dof.Tx) {
            this.articulation_matrix.pre_multiply(Mat4.translation(theta[index], 0, 0));
            index += 1;
        }
        if (this.dof.Ty) {
            this.articulation_matrix.pre_multiply(Mat4.translation(0, theta[index], 0));
            index += 1;
        }
        if (this.dof.Tz) {
            this.articulation_matrix.pre_multiply(Mat4.translation(0, 0, theta[index]));
        }
    }

    get_local_transformation_matrix() {
        return this.location_matrix.times(this.articulation_matrix);
    }

    get_global_transform() {
        let global_transform = this.get_local_transformation_matrix().copy();

        if (this.parent_node !== null) {
            let parent_arc = this.parent_node.parent_arc;
            if (parent_arc !== null) {
                global_transform.pre_multiply(parent_arc.get_global_transform());
            }
        }

        return global_transform;
    }

    get_global_position() {
        let global_transform = this.get_global_transform();
        return vec3(global_transform[0][3], global_transform[1][3], global_transform[2][3]);
    }
}

class Stem extends Node {
    constructor(name, shape, transform, color) {
        super(name, shape, transform, color);

        this.inertia = 2;
        this.joint_theta = vec3(0, 0, 0);
        this.ang_vel = vec3(0, 0, 0);
        this.ext_torque = vec3(0, 0, 0);

        this.ks = 30;
        this.kd = 10;

    }

    update(dt, wind_torque) {
        this.ext_torque = vec3(0, 0, 0);
        // if (!this.valid)
        //     throw "Initialization not complete."

        if (wind_torque !== null)
            this.ext_torque.add_by(wind_torque);

        let spring_torque = this.calculate_viscoelastic_forces();
        this.ext_torque.add_by(spring_torque);

        this.symplectic_euler_update(dt);
    }

    symplectic_euler_update(dt) {
        this.ang_vel = this.ang_vel.plus(this.ext_torque.times(dt / this.inertia));
        this.joint_theta = this.joint_theta.plus(this.ang_vel.times(dt));

        this.parent_arc.update_articulation([this.joint_theta[0], this.joint_theta[2]]);
    }

    calculate_viscoelastic_forces() {
        let spring_vec = this.joint_theta;
        let damper_vec = this.ang_vel;

        let x_norm = vec3(1, 0, 0);
        let z_norm = vec3(0, 0, 1);

        let offset_x = spring_vec[0];
        let offset_z = spring_vec[2];
        let fs_x = x_norm.times(-this.ks).times(offset_x);
        let fs_z = z_norm.times(-this.ks).times(offset_z);
        let fd_x = x_norm.times(damper_vec[0]).times(-this.kd);
        let fd_z = z_norm.times(damper_vec[2]).times(-this.kd);

        return fs_x.plus(fs_z).plus(fd_x).plus(fd_z);
    }
}