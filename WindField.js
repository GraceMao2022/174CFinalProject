import { tiny, defs } from './examples/common.js';

// Pull these names into this module's scope for convenience:
const { vec3, vec4, color, Mat4, Shape, Material, Shader, Texture, Component } = tiny;

export
    const WindField =
        class WindField {
            constructor(source_point, direction, magnitude) {
                this.source_point = source_point;
                this.direction = direction.normalized();
                this.magnitude = magnitude; // at source point
            }

            get_strength_at_point(location) {
                let source_point_to_loc = location.minus(this.source_point);

                // location is behind wind source
                if (source_point_to_loc.dot(this.direction) < 0)
                    return 0;

                return 1 / source_point_to_loc.norm() * this.magnitude;

            }
        }