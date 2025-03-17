import { tiny, defs } from './examples/common.js';

const { vec3, vec4, color, Mat4, Shape, Material, Shader, Texture, Component } = tiny;

export class DetachedSeed {
    constructor(shape, transform, color, start_pos, control_point1, control_point2, end_pos, ground_level = 0) {
        this.shape = shape;
        this.transform_matrix = transform;
        this.color = color;

        // Bézier curve parameters (4 control points)
        this.start_pos = start_pos;         // P0: Starting position
        this.control_point1 = control_point1; // P1: First control point
        this.control_point2 = control_point2; // P2: Second control point
        this.end_pos = end_pos;             // P3: Ending position

        this.t = 0; // Parameter from 0 to 1
        this.speed = 0.05; // Adjust this to control flight speed
        this.spline_completed = false;
        this.visible = true; // Flag to control visibility
        this.ground_level = ground_level; // Ground level (default y = 0)
    }

    updateSplinePosition(dt) {
        if (!this.spline_completed && this.visible) {
            this.t += this.speed * dt;
            if (this.t >= 1) {
                this.t = 1;
                this.spline_completed = true;
            }

            // Check if the seed has hit the ground
            const current_position = this.getCurrentPosition();
            if (current_position[1] <= this.ground_level) {
                this.visible = false; // Make the seed disappear
                this.spline_completed = true; // Stop updating the spline
            }
        }
    }

    getCurrentPosition() {
        const t = this.t;
        const t2 = t * t;
        const t3 = t2 * t;
        const one_minus_t = 1 - t;
        const one_minus_t2 = one_minus_t * one_minus_t;
        const one_minus_t3 = one_minus_t2 * one_minus_t;

        // Cubic Bézier basis functions
        const b0 = one_minus_t3;          // (1-t)^3
        const b1 = 3 * one_minus_t2 * t;  // 3(1-t)^2 * t
        const b2 = 3 * one_minus_t * t2;  // 3(1-t) * t^2
        const b3 = t3;                    // t^3

        // Calculate current position using cubic Bézier interpolation
        return this.start_pos.times(b0)
            .plus(this.control_point1.times(b1))
            .plus(this.control_point2.times(b2))
            .plus(this.end_pos.times(b3));
    }

    getCurrentTransform() {
        const position = this.getCurrentPosition();

        // Create transformation matrix
        let transform = Mat4.translation(position[0], position[1], position[2])
            .times(this.transform_matrix);

        return transform;
    }

    draw(webgl_manager, uniforms, material) {
        if (this.visible) {
            const current_transform = this.getCurrentTransform();
            this.shape.draw(webgl_manager, uniforms, current_transform, { ...material, color: this.color });
        }
    }
}