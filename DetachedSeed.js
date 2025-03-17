import { tiny, defs } from './examples/common.js';

const { vec3, vec4, color, Mat4, Shape, Material, Shader, Texture, Component } = tiny;

export class DetachedSeed {
    constructor(shape, transform, color, start_pos, start_tangent) {
        this.shape = shape;
        this.transform_matrix = transform;
        this.color = color;

        // Spline parameters
        this.start_pos = start_pos;
        this.start_tangent = start_tangent;

        this.hermite_spline = new Hermite_Spline()
        this.make_hermite_spline(start_pos, start_tangent)

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

    make_hermite_spline(start_pos, start_tangent) {
        if (start_tangent[0] === 0 && start_tangent[1] === 0 && start_tangent[2] === 0)
            start_tangent = vec3(
                (Math.random() * 2 - 1) * 10,
                5 + Math.random() * 10,
                (Math.random() * 2 - 1) * 10
            );
        this.hermite_spline.add_point(start_pos[0], start_pos[1], start_pos[2], start_tangent[0], start_tangent[1], start_tangent[2]);
        let next_pos = start_pos.plus(start_tangent)
        // if go into ground
        if (next_pos[1] < 0)
            next_pos = vec3(next_pos[0], 0.05, next_pos[2])
        // add random upwards direction for next control point
        let next_tangent = vec3(start_tangent[0], start_tangent[1] + Math.random() * 2, start_tangent[2]);
        // let next_tangent = start_tangent;
        this.hermite_spline.add_point(next_pos[0], next_pos[1], next_pos[2], next_tangent[0], next_tangent[1], next_tangent[2]);
        next_pos = next_pos.plus(next_tangent)
        // if go into ground
        if (next_pos[1] < 0)
            next_pos = vec3(next_pos[0], 0.05, next_pos[2])
        next_tangent = vec3(start_tangent[0], start_tangent[1] + Math.random() * 2, start_tangent[2]);
        this.hermite_spline.add_point(next_pos[0], next_pos[1], next_pos[2], next_tangent[0], next_tangent[1], next_tangent[2]);
    }

    getCurrentTransform() {
        const position = this.hermite_spline.get_position(this.t);

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

class Hermite_Spline {
    constructor() {
        this.control_points = []
        this.sample_count = 1000
    }

    num_control_points() {
        return this.control_points.length;
    }

    add_point(x, y, z, sx, sy, sz) {
        let control_point = {
            x: x,
            y: y,
            z: z,
            sx: sx,
            sy: sy,
            sz: sz
        }
        this.control_points.push(control_point);
    }

    get_point(index) {
        if (index < this.control_points.length)
            return this.control_points[index]
    }

    set_tangent(index, sx, sy, sz) {
        this.control_points[index].sx = sx;
        this.control_points[index].sy = sy;
        this.control_points[index].sz = sz;
    }

    set_point(index, x, y, z) {
        this.control_points[index].x = x;
        this.control_points[index].y = y;
        this.control_points[index].z = z;
    }

    get_position(global_t) {
        if (this.num_control_points() < 2) { return vec3(0, 0, 0); }

        const A = Math.floor(global_t * (this.num_control_points() - 1));
        const B = Math.ceil(global_t * (this.num_control_points() - 1));
        const s = (global_t * (this.num_control_points() - 1)) % 1.0;

        return this.get_point_on_polynomial(s, A, B);
    }

    get_point_on_polynomial(t, index1, index2) {
        let point1 = this.control_points[index1];
        let point2 = this.control_points[index2];
        let scale = this.num_control_points() - 1;
        return vec3(point1.x * (2 * t ** 3 - 3 * t ** 2 + 1) + point1.sx * (t ** 3 - 2 * t ** 2 + t) / scale
            + point2.x * (-2 * t ** 3 + 3 * t ** 2) + point2.sx * (t ** 3 - t ** 2) / scale,
            point1.y * (2 * t ** 3 - 3 * t ** 2 + 1) + point1.sy * (t ** 3 - 2 * t ** 2 + t) / scale
            + point2.y * (-2 * t ** 3 + 3 * t ** 2) + point2.sy * (t ** 3 - t ** 2) / scale,
            point1.z * (2 * t ** 3 - 3 * t ** 2 + 1) + point1.sz * (t ** 3 - 2 * t ** 2 + t) / scale
            + point2.z * (-2 * t ** 3 + 3 * t ** 2) + point2.sz * (t ** 3 - t ** 2) / scale)
    }

    clear() {
        this.control_points = []
    }
}