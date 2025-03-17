import { tiny, defs } from './examples/common.js';

// Pull these names into this module's scope for convenience:
const { vec3, Mat4 } = tiny;

const shapes = {
    'sphere': new defs.Subdivision_Sphere(5),
    'cylinder': new defs.Cylindrical_Tube(20, 20, [[0, 0], [0, 0]]),
};

export class WindField {
    constructor(source_point, direction, magnitude) {
        this.source_point = source_point || vec3(0, 0, 0);
        this.direction = direction.normalized() || vec3(1, 0, 0);
        this.magnitude = magnitude || 1.0;
        this.variability = 0.3;
        this.frequency = 0.2;
        this.time = 0;
        this.drag_coefficient = 0.47;
        this.air_density = 1.225;
    }

    // Get wind force at specific position and time
    getWindForce(position, radius) {
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
        const force_magnitude = 0.5 * this.air_density * wind_strength * wind_strength * this.drag_coefficient * area * 10;
        return wind_dir.times(force_magnitude);
    }

    getWindDirection(position) {
        // Optionally, modify direction based on position (e.g., turbulence)
        return this.direction; // For now, return a constant wind direction
    }

    // Main update function to be called from animation loop
    update(dt) {
        this.time += dt;
    }

    draw(caller, uniforms, material) {
        const indicator_length = this.magnitude * 0.05;
        const indicator_pos = this.source_point.minus(this.direction.times(indicator_length / 2));
        const arrow_transform = Mat4.scale(0.1, 0.1, indicator_length);

        // Calculate rotation to align with wind direction
        const z_axis = vec3(0, 0, 1);
        const rotation_axis = z_axis.cross(this.direction).normalized();
        const angle = Math.acos(z_axis.dot(this.direction));

        arrow_transform.pre_multiply(Mat4.rotation(angle, rotation_axis[0], rotation_axis[1], rotation_axis[2]));
        arrow_transform.pre_multiply(Mat4.translation(indicator_pos[0], indicator_pos[1], indicator_pos[2]));

        // Draw the wind arrow
        shapes.cylinder.draw(caller, uniforms, arrow_transform, material);

        // Draw arrow head
        const head_transform = Mat4.scale(0.2, 0.2, 0.2);
        head_transform.pre_multiply(Mat4.translation(this.source_point[0], this.source_point[1], this.source_point[2]));
        shapes.sphere.draw(caller, uniforms, head_transform, material);
    }
}

export class MovingWindField extends WindField {
    constructor(source_point, direction, magnitude) {
        super(source_point, direction, magnitude);
    }

    update(dt) {
        this.time += dt;

        this.source_point.add_by(this.direction.times(0.01));
    }
}