import { tiny, defs } from './examples/common.js';
import { Shape_From_File } from './examples/obj-file-demo.js';

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
    'white': color(1, 1, 1, 1)
}

export
    const Dandelion =
        class Dandelion {
            constructor(ground_pos) {

                // leaf
                this.leaf_texture = {
                    shader: new defs.Textured_Phong(), color: color(0, 0, 0, 1),
                    ambient: 0.5, diffusivity: .5, specularity: .5, texture: new Texture("assets/dandelion_leafTransp.png", "NPOT")
                };
                const leaf_rotation = Math.random() * 2 * Math.PI;
                this.leaf_transform = Mat4.translation(0, 1, 0).times(Mat4.rotation(leaf_rotation, 0, 1, 0)).times(Mat4.scale(2, 2, 2));

                // root->stem
                const root_location = Mat4.translation(ground_pos[0], ground_pos[1], ground_pos[2]);
                // this.root = new Arc("root", null, this.stem_node, root_location);
                // this.stem_node.parent_arc = this.root;
                this.root = new Arc("root", null, null, root_location);
                // this.stem_node.parent_arc = this.root;
                this.root.set_dof(true, false, true, false, false, false);

                // actual stem
                this.num_stem_segments = 10;
                this.stem_length = 5;
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
                // const recept_joint_location = Mat4.translation(0, this.stem_length, 0);
                // this.recept_joint = new Arc("recept_joint", this.stem_node, this.receptacle_node, recept_joint_location);
                // this.stem_node.children_arcs.push(this.recept_joint);
                // this.receptacle_node.parent_arc = this.recept_joint;
                // this.recept_joint.set_dof(false, false, false, false, false, false);

                // add stem end-effector (at middle of receptacle)
                const stem_end_effector_pos = vec4(0, 0, 0, 1);
                this.stem_end_effector = new End_Effector("receptacle", final_stem_joint, stem_end_effector_pos);
                final_stem_joint.end_effector = this.stem_end_effector;

                // two dofs per stem joint
                this.stem_dof = this.num_stem_segments * 2;
                this.stem_theta = new Array(this.stem_dof).fill(0);
                this.apply_theta();

                this.num_seeds = 15;
                this.seed_length = 1;
                this.seed_display_length = 0.3;
                this.seed_width = 0.5;
                this.seeds = [];
                this.seed_joints = [];
                this.spawn_seeds(this.num_seeds);
            }

            spawn_stem(num_segments) {
                const segment_len = this.stem_length / num_segments;
                let parent_arc = this.root;
                for (let i = 0; i < num_segments; i++) {
                    // const stem_transform = Mat4.scale(this.stem_width, this.stem_width, segment_len);
                    // stem_transform.pre_multiply(Mat4.rotation(Math.PI / 2, 1, 0, 0));
                    const stem_transform = Mat4.scale(this.stem_width, segment_len, this.stem_width);
                    stem_transform.pre_multiply(Mat4.translation(0, segment_len / 2, 0));
                    let stem_node = new Node("stem", shapes.stem, stem_transform, colors.green);
                    this.stem_segments.push(stem_node);

                    parent_arc.child_node = stem_node;
                    stem_node.parent_arc = parent_arc;
                    this.stem_joints.push(parent_arc);

                    const next_joint_location = Mat4.translation(0, segment_len, 0);
                    // this.root = new Arc("root", null, this.stem_node, root_location);
                    // this.stem_node.parent_arc = this.root;
                    let new_stem_joint = new Arc("stem_joint", stem_node, null, next_joint_location);
                    // this.stem_node.parent_arc = this.root;
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
                    let seed_node = new Seed("seed", shapes.seed, seed_transform, colors.white, end_effector_pos);
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

            update(dt, wind_field) {
                // let stem_end_effector_pos = this.stem_end_effector.get_global_position();
                // // console.log(stem_end_effector_pos)
                // let wind_strength_at_stem = wind_field.get_strength_at_point(stem_end_effector_pos);
                // let wind_force_at_stem = wind_field.direction.times(wind_strength_at_stem);
                // let dx = hermite_pos.minus(end_effector_pos);
                // dx = new Array(dx[0], dx[1], dx[2]);
                // let J = this.calculate_Jacobian();
                // let delta_thetas = this.calculate_delta_theta(J, dx);

                // for (let i = 0; i < this.theta.length; i++) {
                //     this.theta[i] += delta_thetas._data[i][0];
                // }

                // this.apply_theta();
                for (let i = 0; i < this.seeds.length; i++) {
                    let seed = this.seeds[i];
                    if (typeof wind_field !== undefined) {
                        let seed_end_effector_pos = seed.get_end_effector_global_position();

                        // let wind_strength = wind_field.get_strength_at_point(seed_end_effector_pos);

                        let wind_force = wind_field.getWindForce(seed_end_effector_pos, 1, 1);
                        // console.log(wind_strength)
                        // let wind_force = wind_field.direction.times(wind_strength);
                        let radius_vector = seed_end_effector_pos.minus(this.seed_joints[i].get_global_position());

                        // let torque = wind_force.cross(radius_vector);
                        let torque = radius_vector.cross(wind_force);
                        seed.update(dt, torque);
                    }
                    else
                        seed.update(dt, null);
                }


            }

            // update(dt, wind_torque) {
            //     this.ext_torque = vec3(0, 0, 0);
            //     if (!this.valid)
            //         throw "Initialization not complete."


            //     if (wind_torque !== null)
            //         this.ext_torque.add_by(wind_torque);

            //     let spring_torque = this.calculate_viscoelastic_forces();
            //     this.ext_torque.add_by(spring_torque);
            //     // console.log(wind_torque);
            //     // console.log(spring_torque)


            //     this.symplectic_euler_update(dt);
            // }

            // symplectic_euler_update(dt) {
            //     this.ang_vel = this.ang_vel.plus(this.ext_torque.times(dt / this.inertia));
            //     this.joint_theta = this.joint_theta.plus(this.ang_vel.times(dt));

            //     this.parent_arc.update_articulation([this.joint_theta[0], this.joint_theta[1], this.joint_theta[2]]);
            // }

            // calculate_viscoelastic_forces() {
            //     let spring_vec = this.joint_theta;
            //     let damper_vec = this.ang_vel;
            //     // let spring_vec_norm = spring_vec.normalized();
            //     // console.log(spring_vec);
            //     let x_norm = vec3(1, 0, 0);
            //     let y_norm = vec3(0, 1, 0);
            //     let z_norm = vec3(0, 0, 1);
            //     let distance = spring_vec.norm();
            //     let offset_x = spring_vec[0];
            //     let offset_y = spring_vec[1];
            //     let offset_z = spring_vec[2];
            //     let fs_x = x_norm.times(-this.ks).times(offset_x);
            //     let fs_y = y_norm.times(-this.ks).times(offset_y);
            //     let fs_z = z_norm.times(-this.ks).times(offset_z);
            //     let fd_x = x_norm.times(damper_vec[0]).times(-this.kd);
            //     let fd_y = y_norm.times(damper_vec[1]).times(-this.kd);
            //     let fd_z = z_norm.times(damper_vec[2]).times(-this.kd);
            //     // console.log(fd_x)
            //     // console.log(fd_y)
            //     // console.log(fd_z)
            //     // console.log(this.joint_theta)
            //     // console.log(this.ang_vel)
            //     // console.log(fs_x)
            //     // console.log(fs_y)
            //     // console.log(fs_z)
            //     return fs_x.plus(fs_y).plus(fs_z).plus(fd_x).plus(fd_y).plus(fd_z);
            // }

            // mapping from global theta to each joint theta
            apply_theta() {
                // TODO: Implement your theta mapping here

                for (let i = 0; i < this.num_stem_segments; i++) {
                    this.stem_joints[i].update_articulation([this.stem_theta[2 * i], this.stem_theta[2 * i + 1]]);
                }

                // shoulder x-y-z
                // this.r_shoulder.update_articulation([this.theta[0], this.theta[1], this.theta[2]]);

                // // elbow x-y
                // this.r_elbow.update_articulation([this.theta[3], this.theta[4]]);

                // // wrist y-z
                // this.r_wrist.update_articulation([this.theta[5], this.theta[6]]);

                // //root translational x-z
                // this.root.update_articulation([this.theta[7], this.theta[8]]);
            }

            calculate_Jacobian() {
                let J = new Array(3);
                for (let i = 0; i < 3; i++) {
                    J[i] = new Array(this.dof);
                }

                let n = 0.0001;
                let curr_end_effector_pos = this.get_end_effector_position();

                for (let i = 0; i < this.dof; i++) {
                    this.theta[i] += n;
                    this.apply_theta();

                    let new_end_effector_pos = this.get_end_effector_position();

                    let d_dof_d_theta = new_end_effector_pos.minus(curr_end_effector_pos).times(1 / n);

                    J[0][i] = d_dof_d_theta[0];
                    J[1][i] = d_dof_d_theta[1];
                    J[2][i] = d_dof_d_theta[2];
                    curr_end_effector_pos = new_end_effector_pos.copy();
                }

                return J;
            }

            calculate_delta_theta(J, dx) {
                // console.log(J);
                // console.log(dx)
                const A = math.multiply(math.transpose(J), J);
                // console.log(A);

                const lambda = 0.0001;
                const I = math.identity(A.length);
                const A_damped = math.add(A, math.multiply(lambda, I));

                const b = math.multiply(math.transpose(J), dx);
                // console.log(b);
                const x = math.lusolve(A_damped, b)
                // console.log(x);

                return x;
            }

            get_end_effector_position() {
                const v = this.end_effector.get_global_position();
                return vec3(v[0], v[1], v[2]);
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

                    // if (node.name === "seed") {
                    //     let end_effector_transform = Mat4.scale(0.1, 0.1, 0.1);
                    //     let global_pos = node.get_end_effector_global_position();
                    //     end_effector_transform.pre_multiply(Mat4.translation(global_pos[0], global_pos[1], global_pos[2]));
                    //     shapes.sphere.draw(webgl_manager, uniforms, end_effector_transform, { ...material, color: node.color })
                    // }

                    matrix = this.matrix_stack.pop();
                    for (const next_arc of node.children_arcs) {
                        this.matrix_stack.push(matrix.copy());
                        this._rec_draw(next_arc, matrix, webgl_manager, uniforms, material);
                        matrix = this.matrix_stack.pop();
                    }
                }
            }

            debug(arc = null, id = null) {

                // this.theta = this.theta.map(x => x + 0.01);
                // this.apply_theta();
                const J = this.calculate_Jacobian();
                let dx = [[0], [-0.02], [0]];
                if (id === 2)
                    dx = [[-0.02], [0], [0]];
                const dtheta = this.calculate_delta_theta(J, dx);

                // const direction = new Array(this.dof);
                // let norm = 0;
                // for (let i = 0; i < direction.length; i++) {
                //     direction[i] = dtheta[i][0];
                //     norm += direction[i] ** 2.0;
                // }
                // norm = norm ** 0.5;
                // console.log(direction);
                // console.log(norm);
                // this.theta = this.theta.map((v, i) => v + 0.01 * (direction[i] / norm));
                this.theta = this.theta.map((v, i) => v + dtheta[i][0]);
                this.apply_theta();

                // if (arc === null)
                //     arc = this.root;
                //
                // if (arc !== this.root) {
                //     arc.articulation_matrix = arc.articulation_matrix.times(Mat4.rotation(0.02, 0, 0, 1));
                // }
                //
                // const node = arc.child_node;
                // for (const next_arc of node.children_arcs) {
                //     this.debug(next_arc);
                // }
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


        this.inertia = 2;
        // thetas for joint attached to receptacle
        this.joint_theta = vec3(0, 0, 0);
        this.end_effector_local_pos = end_effector_pos;
        this.prev_pos = vec3(0, 0, 0);
        this.ang_vel = vec3(0, 0, 0);
        this.ang_acc = vec3(0, 0, 0);
        this.ext_torque = vec3(0, 0, 0);
        this.valid = true;
        this.has_moved = false;


        this.ks = 20;
        this.kd = 5;
        this.rest_theta = vec3(0, 0, 0);
    }

    update(dt, wind_torque) {
        this.ext_torque = vec3(0, 0, 0);
        if (!this.valid)
            throw "Initialization not complete."


        if (wind_torque !== null)
            this.ext_torque.add_by(wind_torque);

        let spring_torque = this.calculate_viscoelastic_forces();
        this.ext_torque.add_by(spring_torque);
        // console.log(wind_torque);
        // console.log(spring_torque)


        this.symplectic_euler_update(dt);
    }

    symplectic_euler_update(dt) {
        this.ang_vel = this.ang_vel.plus(this.ext_torque.times(dt / this.inertia));
        this.joint_theta = this.joint_theta.plus(this.ang_vel.times(dt));

        this.parent_arc.update_articulation([this.joint_theta[0], this.joint_theta[1], this.joint_theta[2]]);
    }

    calculate_viscoelastic_forces() {
        let spring_vec = this.joint_theta;
        let damper_vec = this.ang_vel;
        // let spring_vec_norm = spring_vec.normalized();
        // console.log(spring_vec);
        let x_norm = vec3(1, 0, 0);
        let y_norm = vec3(0, 1, 0);
        let z_norm = vec3(0, 0, 1);
        let distance = spring_vec.norm();
        let offset_x = spring_vec[0];
        let offset_y = spring_vec[1];
        let offset_z = spring_vec[2];
        let fs_x = x_norm.times(-this.ks).times(offset_x);
        let fs_y = y_norm.times(-this.ks).times(offset_y);
        let fs_z = z_norm.times(-this.ks).times(offset_z);
        let fd_x = x_norm.times(damper_vec[0]).times(-this.kd);
        let fd_y = y_norm.times(damper_vec[1]).times(-this.kd);
        let fd_z = z_norm.times(damper_vec[2]).times(-this.kd);
        // console.log(fd_x)
        // console.log(fd_y)
        // console.log(fd_z)
        // console.log(this.joint_theta)
        // console.log(this.ang_vel)
        // console.log(fs_x)
        // console.log(fs_y)
        // console.log(fs_z)
        return fs_x.plus(fs_y).plus(fs_z).plus(fd_x).plus(fd_y).plus(fd_z);
    }

    // of end effector
    get_end_effector_global_position() {
        let pos = this.parent_arc.get_global_transform().times(this.end_effector_local_pos);
        return vec3(pos[0], pos[1], pos[2]);
    }
}