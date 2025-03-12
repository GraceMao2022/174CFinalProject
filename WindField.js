import { tiny, defs } from './examples/common.js';

// Pull these names into this module's scope for convenience:
const { vec3, vec4, color, Mat4, Shape, Material, Shader, Texture, Component } = tiny;

// export
//     const WindField =
//         class WindField {
//             constructor(source_point, direction, magnitude) {
//                 this.source_point = source_point;
//                 this.direction = direction.normalized();
//                 this.magnitude = magnitude; // at source point
//             }

//             get_strength_at_point(location) {
//                 let source_point_to_loc = location.minus(this.source_point);

//                 // location is behind wind source
//                 if (source_point_to_loc.dot(this.direction) < 0)
//                     return 0;

//                 return 1 / source_point_to_loc.norm() * this.magnitude;

//             }
//         }

export class WindField {
    constructor(source_point, direction, magnitude) {
        // Wind parameters
        this.source_point = source_point || vec3(0, 0, 0); // Position where wind originates
        this.direction = direction.normalized() || vec3(1, 0, 0).normalized(); // Normalized direction vector
        this.magnitude = magnitude || 1.0; // Strength of the wind

        // Variability for natural wind effect
        this.variability = 0.3; // Default variability
        this.frequency = 0.2;   // Default frequency for oscillation
        this.time = 0;

        // Physics constants
        this.gravity = vec3(0, -9.8, 0);
        this.drag_coefficient = 0.47; // For spherical objects
        this.air_density = 1.225;     // kg/m^3 at sea level

        // Spring-damper parameters for stem and seeds
        this.spring_constant = 20;
        this.damping_constant = 1.5;

        // Integration parameters
        this.dt = 0.016; // ~60 fps
        this.sub_steps = 3;
        this.sub_dt = this.dt / this.sub_steps;

        // Seeds tracking
        this.detached_seeds = [];
    }

    // Get wind force at a specific position
    getWindForce(position, radius, mass) {
        let wind_dir = this.direction.copy();
        const distance = position.minus(this.source_point).norm();
        const falloff = Math.max(1, distance);
        let wind_strength = this.magnitude / (falloff * falloff);

        const variability_x = Math.sin(this.time * this.frequency * 1.0) * this.variability;
        const variability_y = Math.sin(this.time * this.frequency * 1.3) * this.variability * 0.5;
        const variability_z = Math.sin(this.time * this.frequency * 0.7) * this.variability;

        const pos_factor = Math.sin(position[0] * 0.1 + position[1] * 0.2 + position[2] * 0.15 + this.time * 0.3) * 0.5;

        wind_dir[0] += variability_x + pos_factor * 0.2;
        wind_dir[1] += variability_y + pos_factor * 0.1;
        wind_dir[2] += variability_z + pos_factor * 0.15;
        wind_dir = wind_dir.normalized();

        const area = Math.PI * radius * radius;
        const force_magnitude = 0.5 * this.air_density * wind_strength * wind_strength * this.drag_coefficient * area * 10; // Scale up by 10
        return wind_dir.times(force_magnitude);
    }

    // Apply spring-damper forces to stem segments
    applyStemForces(dandelion) {
        for (let i = 0; i < dandelion.stem_segments.length; i++) {
            const segment = dandelion.stem_segments[i];
            const position = segment.get_global_position();
            const joint = dandelion.stem_joints[i];

            const segment_radius = dandelion.stem_width;
            const segment_mass = 0.1;
            const wind_force = this.getWindForce(position, segment_radius, segment_mass);

            const curr_theta_x = dandelion.stem_theta[2 * i];
            const curr_theta_z = dandelion.stem_theta[2 * i + 1];

            const spring_force_x = -this.spring_constant * curr_theta_x;
            const spring_force_z = -this.spring_constant * curr_theta_z;

            const angular_velocity_x = (curr_theta_x - (dandelion.prev_stem_theta ? dandelion.prev_stem_theta[2 * i] : 0)) / this.dt;
            const angular_velocity_z = (curr_theta_z - (dandelion.prev_stem_theta ? dandelion.prev_stem_theta[2 * i + 1] : 0)) / this.dt;
            const damping_force_x = -this.damping_constant * angular_velocity_x;
            const damping_force_z = -this.damping_constant * angular_velocity_z;

            const torque_x = wind_force[0] * 0.2 + spring_force_x + damping_force_x;
            const torque_z = wind_force[2] * 0.2 + spring_force_z + damping_force_z;

            const angular_accel_x = torque_x / segment_mass;
            const angular_accel_z = torque_z / segment_mass;

            if (!dandelion.prev_stem_theta) {
                dandelion.prev_stem_theta = [...dandelion.stem_theta];
            }

            const new_theta_x = 2 * curr_theta_x - dandelion.prev_stem_theta[2 * i] + angular_accel_x * this.dt * this.dt;
            const new_theta_z = 2 * curr_theta_z - dandelion.prev_stem_theta[2 * i + 1] + angular_accel_z * this.dt * this.dt;

            const max_bend = 0.5; // Increased from 0.3 for more visible bending
            dandelion.prev_stem_theta[2 * i] = curr_theta_x;
            dandelion.prev_stem_theta[2 * i + 1] = curr_theta_z;
            dandelion.stem_theta[2 * i] = Math.max(Math.min(new_theta_x, max_bend), -max_bend);
            dandelion.stem_theta[2 * i + 1] = Math.max(Math.min(new_theta_z, max_bend), -max_bend);
        }
    }

    applySeedForces(dandelion) {
        for (let i = 0; i < dandelion.seeds.length; i++) {
            const seed = dandelion.seeds[i];
            const seed_joint = dandelion.seed_joints[i];

            if (!seed.detached) {
                const seed_position = seed.get_end_effector_global_position();
                const seed_radius = dandelion.seed_width;
                const seed_mass = 0.01;

                const wind_force = this.getWindForce(seed_position, seed_radius, seed_mass);

                if (!seed.has_moved) {
                    seed.prev_pos = seed_position;
                    seed.has_moved = true;
                }

                const current_vel = seed_position.minus(seed.prev_pos).times(1 / this.dt);
                seed.vel = current_vel;
                seed.prev_pos = seed_position;

                const force_magnitude = wind_force.norm();
                const detachment_threshold = 0.2; // Lowered from 0.5 for easier detachment after swaying
                const chance_of_detachment = Math.pow(force_magnitude / detachment_threshold, 2) * 0.05;

                if (Math.random() < chance_of_detachment) {
                    seed.detached = true;
                    seed.vel = current_vel.plus(wind_force.times(0.1));
                    seed.pos = seed_position;
                    seed.acc = vec3(0, 0, 0);
                    seed.mass = seed_mass;
                    seed.radius = seed_radius;
                    this.detached_seeds.push(seed);
                    seed.color = tiny.color(0, 0, 0, 0); // Make invisible
                } else {
                    const torque_x = wind_force[0] * 0.5;
                    const torque_y = wind_force[1] * 0.5;

                    seed.theta_x = seed.theta_x || 0; // Ensure initialized
                    seed.theta_y = seed.theta_y || 0;
                    seed.theta_x += torque_x * 0.05; // Increased from 0.01 for more sway
                    seed.theta_y += torque_y * 0.05;

                    const max_bend = 0.7; // Increased from 0.5 for more visible sway
                    seed.theta_x = Math.max(Math.min(seed.theta_x, max_bend), -max_bend);
                    seed.theta_y = Math.max(Math.min(seed.theta_y, max_bend), -max_bend);

                    seed_joint.update_articulation([seed.theta_x, seed.theta_y]);
                }
            }
        }
    }

    // Update detached seeds using Verlet integration
    updateDetachedSeeds() {
        for (let i = this.detached_seeds.length - 1; i >= 0; i--) {
            const seed = this.detached_seeds[i];

            for (let step = 0; step < this.sub_steps; step++) {
                const wind_force = this.getWindForce(seed.pos, seed.radius, seed.mass);
                const gravity_force = this.gravity.times(seed.mass);
                const drag_force = seed.vel.normalized().times(-seed.vel.norm() * seed.vel.norm() * 0.01);
                const total_force = wind_force.plus(gravity_force).plus(drag_force);

                seed.acc = total_force.times(1 / seed.mass);

                const temp_pos = seed.pos.copy();
                seed.pos = seed.pos.times(2).minus(seed.prev_pos).plus(seed.acc.times(this.sub_dt * this.sub_dt));
                seed.prev_pos = temp_pos;
                seed.vel = seed.pos.minus(seed.prev_pos).times(1 / this.sub_dt);

                if (seed.pos[1] < -50 || seed.pos.norm() > 100) {
                    this.detached_seeds.splice(i, 1);
                    break;
                }
            }
        }
    }

    // Main update function
    update(dandelion, dt) {
        if (dt) this.dt = dt;
        this.time += this.dt;

        if (!dandelion.prev_stem_theta) {
            dandelion.prev_stem_theta = [...dandelion.stem_theta];
        }

        this.applyStemForces(dandelion);
        this.applySeedForces(dandelion);
        this.updateDetachedSeeds();

        dandelion.apply_theta();
    }

    // Draw detached seeds
    drawDetachedSeeds(webgl_manager, uniforms, shapes, material) {
        for (const seed of this.detached_seeds) {
            const seed_transform = tiny.Mat4.scale(0.05, 0.05, 0.15);
            seed_transform.pre_multiply(tiny.Mat4.translation(seed.pos[0], seed.pos[1], seed.pos[2]));

            shapes.cylinder.draw(webgl_manager, uniforms, seed_transform, {
                ...material,
                color: tiny.color(1, 1, 1, 1)
            });

            const fluff_transform = tiny.Mat4.scale(0.1, 0.1, 0.1);
            fluff_transform.pre_multiply(tiny.Mat4.translation(seed.pos[0], seed.pos[1], seed.pos[2]));
            shapes.sphere.draw(webgl_manager, uniforms, fluff_transform, {
                ...material,
                color: tiny.color(1, 1, 1, 0.8)
            });
        }
    }
}
//
// // Demo implementation to show how to use the WindField with your dandelion
// export class DandelionWindSimulation {
//     constructor() {
//         // Create dandelion
//         this.dandelion = new Dandelion(vec3(0, 0, 0));
//
//         // Create wind field with custom parameters
//         this.wind = new WindField({
//             strength: 2.0,
//             direction: vec3(1, 0.2, 0.5).normalized(),
//             variability: 0.4,
//             frequency: 0.3,
//             spring_constant: 15,
//             damping_constant: 1.2
//         });
//
//         // Track time
//         this.t = 0;
//     }
//
//     // Main update loop
//     update(dt) {
//         this.t += dt;
//
//         // Oscillate wind strength for more interesting effects
//         this.wind.strength = 2.0 + Math.sin(this.t * 0.2) * 1.5;
//
//         // Slowly shift wind direction
//         const angle = this.t * 0.05;
//         this.wind.direction = vec3(
//             Math.cos(angle),
//             0.2 + Math.sin(angle * 0.3) * 0.1,
//             Math.sin(angle)
//         ).normalized();
//
//         // Update wind simulation
//         this.wind.update(this.dandelion, dt);
//     }
//
//     // Render function
//     render(webgl_manager, uniforms, material) {
//         // Draw dandelion
//         this.dandelion.draw(webgl_manager, uniforms, material);
//
//         // Draw detached seeds
//         this.wind.drawDetachedSeeds(webgl_manager, uniforms, {
//             sphere: this.dandelion.seeds[0].shape,
//             cylinder: this.dandelion.seeds[0].shape
//         }, material);
//     }
//
//     // Handle user interaction (e.g., blow on dandelion)
//     userBlow(direction, strength) {
//         // Temporarily increase wind in the direction the user is blowing
//         const original_direction = this.wind.direction.copy();
//         const original_strength = this.wind.strength;
//
//         // Apply user's blow
//         this.wind.direction = direction.normalized();
//         this.wind.strength = strength;
//
//         // Update for immediate effect
//         this.wind.update(this.dandelion, 0.05);
//
//         // Schedule return to original wind
//         setTimeout(() => {
//             this.wind.direction = original_direction;
//             this.wind.strength = original_strength;
//         }, 500);
//     }
// }