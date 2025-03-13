import { tiny } from './examples/common.js';

const { vec3, Mat4 } = tiny;

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
        const force_magnitude = 0.5 * this.air_density * wind_strength * wind_strength * this.drag_coefficient * area * 10;
        return wind_dir.times(force_magnitude);
    }

    update(dandelion, dt) {
        this.time += dt;
        dandelion.update(dt, this);
    }
}