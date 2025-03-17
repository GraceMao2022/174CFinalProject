import { tiny, defs } from './examples/common.js';

const { vec3, vec4, color, Mat4, Shape, Material, Shader, Texture, Component } = tiny;


export class DetachedSeed {
    constructor(shape, transform, color, start_pos, end_pos, start_tangent, end_tangent) {
        this.shape = shape;
        this.transform_matrix = transform;
        this.color = color;

        // Spline parameters
        this.start_pos = start_pos;
        this.end_pos = end_pos;
        this.start_tangent = start_tangent;
        this.end_tangent = end_tangent;

        this.t = 0; // Parameter from 0 to 1
        this.speed = 0.05; // Adjust this to control flight speed
        this.spline_completed = false;
    }

    updateSplinePosition(dt) {
        this.t += this.speed * dt;
        if (this.t >= 1) {
            this.t = 1;
            this.spline_completed = true;
        }
    }

    getCurrentTransform() {
        const t = this.t;
        const t2 = t * t;
        const t3 = t2 * t;

        // Hermite basis functions
        const h00 = 2*t3 - 3*t2 + 1;
        const h10 = t3 - 2*t2 + t;
        const h01 = -2*t3 + 3*t2;
        const h11 = t3 - t2;

        // Calculate current position using Hermite interpolation
        const position = this.start_pos.times(h00)
            .plus(this.start_tangent.times(h10))
            .plus(this.end_pos.times(h01))
            .plus(this.end_tangent.times(h11));

        // Create transformation matrix
        let transform = Mat4.translation(position[0], position[1], position[2])
            .times(this.transform_matrix);

        return transform;
    }

    draw(webgl_manager, uniforms, material) {
        const current_transform = this.getCurrentTransform();
        this.shape.draw(webgl_manager, uniforms, current_transform, { ...material, color: this.color });
    }
}