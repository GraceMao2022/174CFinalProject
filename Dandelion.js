import { tiny, defs } from './examples/common.js';
import { Shape_From_File } from './examples/obj-file-demo.js';
import { DetachedSeed } from './DetachedSeed.js';

// Pull these names into this module's scope for convenience:
const { vec3, vec4, color, Mat4, Shape, Material, Shader, Texture, Component } = tiny;

const shapes = {
    'sphere': new defs.Subdivision_Sphere(5),
    'cylinder': new defs.Cylindrical_Tube(20, 20, [[0, 0], [0, 0]]),
    'seed': new Shape_From_File("./assets/working_seed.obj"),
    'leaf': new Shape_From_File("./assets/leaf2.obj"),
    'receptacle': new Shape_From_File("./assets/stem_pod.obj"),
    'stem': new Shape_From_File("./assets/stem_segment.obj"),
};

const colors = {
    'green': color(0, 1, 0, 1),
    'white': color(1, 1, 1, 1),
}

export
    const Dandelion =
        class Dandelion {
            constructor(ground_pos, stem_length = 5, detach_enabled = true) {
                this.detach_enabled = detach_enabled;

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
                this.receptacle_radius = 0.2;
                let receptacle_transform = Mat4.scale(this.receptacle_radius, this.receptacle_radius, this.receptacle_radius);
                receptacle_transform.pre_multiply(Mat4.translation(0, this.receptacle_radius, 0));
                this.receptacle_node = new Node("receptacle", shapes.receptacle, receptacle_transform, colors.white);
                // final_stem_joint->receptacle
                final_stem_joint.child_node = this.receptacle_node;
                this.receptacle_node.parent_arc = final_stem_joint;
                final_stem_joint.set_dof(false, false, false, false, false, false);

                this.init_num_seeds = 15;
                this.seed_length = 1;
                this.seed_display_length = 0.3;
                this.seed_width = 0.5;
                this.seed_mass = 0.0005;
                this.seeds = [];
                this.seed_joints = [];
                this.detached_seeds = [];
                this.spawn_seeds(this.init_num_seeds);
            }

            update(dt, active_wind_fields) {
                if (active_wind_fields.length === 0)
                    this.applySeedForces(dt, null)
                for (let i = 0; i < active_wind_fields.length; i++)
                    this.applySeedForces(dt, active_wind_fields[i]);
                this.applyStemForces(dt, active_wind_fields);
                this.updateDetachedSeeds(dt);
            }

            applySeedForces(dt, wind_field) {
                for (let i = 0; i < this.seeds.length; i++) {
                    let seed = this.seeds[i];
                    seed.detach_enabled = this.detach_enabled;

                    if (wind_field !== null) {
                        let seed_end_effector_pos = seed.get_end_effector_global_position();

                        let wind_force = wind_field.getWindForce(seed_end_effector_pos, this.seed_width);

                        let radius_vector = seed_end_effector_pos.minus(this.seed_joints[i].get_global_position());

                        let torque = radius_vector.cross(wind_force);
                        seed.update(dt, torque);
                        seed.last_wind_force = wind_force;
                    }
                    else {
                        seed.update(dt, null);
                        seed.last_wind_force = null;
                    }
                    if (seed.detached) {
                        this.createDetachedSeed(seed);
                    }
                }
                this.seeds = this.seeds.filter(seed => !seed.detached);
                this.seed_joints = this.seed_joints.filter((_, i) => !this.seeds[i]?.detached);
            }

            createDetachedSeed(seed) {
                const start_pos = seed.get_global_position();
                const start_tangent = seed.last_wind_force ? seed.last_wind_force.times(10) : vec3(0, 0, 0);

                // Create a detached seed with spline information
                const detached_seed = new DetachedSeed(
                    seed.shape,
                    seed.transform_matrix,
                    seed.color,
                    start_pos,
                    start_tangent
                );

                this.detached_seeds.push(detached_seed);
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

            updateDetachedSeeds(dt) {
                for (let i = this.detached_seeds.length - 1; i >= 0; i--) {
                    const seed = this.detached_seeds[i];

                    // Update seed position along the spline
                    seed.updateSplinePosition(dt);

                    // Remove seeds that have completed their journey or gone off-screen
                    if (seed.spline_completed) {
                        this.detached_seeds.splice(i, 1);
                    }
                }
            }

            draw(webgl_manager, uniforms, material) {
                shapes.leaf.draw(webgl_manager, uniforms, this.leaf_transform, this.leaf_texture);

                this.matrix_stack = [];
                this._rec_draw(this.root, Mat4.identity(), webgl_manager, uniforms, material);

                for (const seed of this.detached_seeds) {
                    seed.draw(webgl_manager, uniforms, material);
                }
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

            spawn_seeds(num_seeds) {
                let points = this.fibonacci_sphere(num_seeds, this.receptacle_radius);
                for (let i = 0; i < num_seeds; i++) {
                    let attach_point = points[i];
                    let normal = attach_point.normalized();

                    let seed_transform = Mat4.scale(this.seed_width, this.seed_display_length, this.seed_width);
                    seed_transform.pre_multiply(Mat4.rotation(Math.PI / 2, 1, 0, 0));
                    // rotation
                    let v = vec3(0, 0, 1);
                    const w = v.cross(normal).normalized();
                    const theta = Math.acos(v.dot(normal));
                    seed_transform.pre_multiply(Mat4.rotation(theta, w[0], w[1], w[2]));
                    // translation
                    const seed_pos = normal.times(this.seed_display_length + 0.2) //relative to joint
                    seed_transform.pre_multiply(Mat4.translation(seed_pos[0], seed_pos[1], seed_pos[2]));
                    let end_effector_pos = normal.times(this.seed_length)
                    end_effector_pos = vec4(end_effector_pos[0], end_effector_pos[1], end_effector_pos[2], 1)
                    let seed_node = new Seed("seed", shapes.seed, seed_transform, colors.white, end_effector_pos, this.detach_enabled);
                    this.seeds.push(seed_node);
                    // receptacle->attach_point->seed
                    const attach_joint_location = Mat4.translation(attach_point[0], attach_point[1] + this.receptacle_radius, attach_point[2]);
                    let attach_joint = new Arc("attach_joint", this.receptacle_node, seed_node, attach_joint_location);
                    this.receptacle_node.children_arcs.push(attach_joint);
                    seed_node.parent_arc = attach_joint;

                    attach_joint.set_dof(true, true, true, false, false, false);
                    this.seed_joints.push(attach_joint);
                }
            }

            // source: https://stackoverflow.com/questions/9600801/evenly-distributing-n-points-on-a-sphere
            fibonacci_sphere(samples, radius) {

                let points = [];
                const phi = Math.PI * (Math.sqrt(5.) - 1.);  // golden angle in radians

                for (let i = 0; i < samples; i++) {
                    let y = radius - (i / (samples - 1)) * radius * 2;  // y goes from 1 to - 1
                    let rad = Math.sqrt(radius * radius - y * y)  // radius at y

                    let theta = phi * i;  // golden angle increment

                    let x = Math.cos(theta) * rad;
                    let z = Math.sin(theta) * rad;

                    points.push(vec3(x, y, z));
                }

                return points
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

class Seed extends Node {
    constructor(name, shape, transform, color, end_effector_pos, detach_enabled) {
        super(name, shape, transform, color);

        this.inertia = 2;
        // thetas for joint attached to receptacle
        this.joint_theta = vec3(0, 0, 0);
        this.end_effector_local_pos = end_effector_pos;
        this.ang_vel = vec3(0, 0, 0);
        this.ext_torque = vec3(0, 0, 0);

        this.detach_enabled = detach_enabled;
        this.detached = false;
        this.detachment_threshold = 0.8;

        this.ks = 10;
        this.kd = 2;

        this.last_wind_force = null;
    }

    update(dt, wind_torque) {
        if (this.detached) return;

        this.ext_torque = vec3(0, 0, 0);

        if (wind_torque !== null)
            this.ext_torque.add_by(wind_torque);

        let spring_torque = this.calculate_viscoelastic_forces();
        this.ext_torque.add_by(spring_torque);

        this.symplectic_euler_update(dt);

        if (this.detach_enabled)
            this.check_detachment();
    }

    check_detachment() {
        // Calculate the total angular displacement
        const displacement = this.joint_theta.norm();

        // If displacement exceeds threshold, detach the seed
        if (displacement > this.detachment_threshold) {
            this.detach();
        }
    }

    detach() {
        this.detached = true;

        // Remove this seed from the parent's children
        if (this.parent_arc && this.parent_arc.parent_node) {
            const parent = this.parent_arc.parent_node;
            const index = parent.children_arcs.indexOf(this.parent_arc);
            if (index > -1) {
                parent.children_arcs.splice(index, 1);
            }
        }
    }

    symplectic_euler_update(dt) {
        this.ang_vel = this.ang_vel.plus(this.ext_torque.times(dt / this.inertia));
        this.joint_theta = this.joint_theta.plus(this.ang_vel.times(dt));

        this.parent_arc.update_articulation([this.joint_theta[0], this.joint_theta[1], this.joint_theta[2]]);
    }

    calculate_viscoelastic_forces() {
        let spring_vec = this.joint_theta;
        let damper_vec = this.ang_vel;

        let x_norm = vec3(1, 0, 0);
        let y_norm = vec3(0, 1, 0);
        let z_norm = vec3(0, 0, 1);

        let offset_x = spring_vec[0];
        let offset_y = spring_vec[1];
        let offset_z = spring_vec[2];
        let fs_x = x_norm.times(-this.ks).times(offset_x);
        let fs_y = y_norm.times(-this.ks).times(offset_y);
        let fs_z = z_norm.times(-this.ks).times(offset_z);
        let fd_x = x_norm.times(damper_vec[0]).times(-this.kd);
        let fd_y = y_norm.times(damper_vec[1]).times(-this.kd);
        let fd_z = z_norm.times(damper_vec[2]).times(-this.kd);

        return fs_x.plus(fs_y).plus(fs_z).plus(fd_x).plus(fd_y).plus(fd_z);
    }

    // of end effector
    get_end_effector_global_position() {
        let pos = this.parent_arc.get_global_transform().times(this.end_effector_local_pos);
        return vec3(pos[0], pos[1], pos[2]);
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