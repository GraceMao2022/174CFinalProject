import { tiny, defs } from './examples/common.js';
import { Dandelion } from './Dandelion.js';
import { WindField } from './WindField.js';

const { vec3, vec4, color, Mat4, Shape, Shader, Texture, Component } = tiny;

export class DandelionTest extends Component {
  init() {
    this.shapes = {
      'box': new defs.Cube(),
      'ground': new defs.Cube(),
      'ball': new defs.Subdivision_Sphere(4),
      'sky': new defs.Subdivision_Sphere(4),
      'axis': new defs.Axis_Arrows(),
    };

    this.materials = {
      plastic: { shader: new defs.Phong_Shader(), ambient: .2, diffusivity: 1, specularity: .5, color: color(.9, .5, .9, 1) },
      soil: { shader: new defs.Textured_Phong(), color: color(0, 0, 0, 1), ambient: 0.5, diffusivity: .5, specularity: 0, texture: new Texture("assets/soil2.jpeg") },
      sky: { shader: new defs.Textured_Phong(), color: color(0, 0, 0, 1), ambient: 1, diffusivity: .5, specularity: .2, texture: new Texture("assets/sky.jpeg") },
    };

    this.shapes.ground.arrays.texture_coord.forEach(v => { v[0] *= 15; v[1] *= 15; });

    this.dandelion1 = new Dandelion(vec3(0, 0, 0));
    this.wind_fields = [
      new WindField(vec3(8, 12, 0), vec3(-1, -1.5, 0), 20),
      new WindField(vec3(3, 2, 5), vec3(-3, -2, -5), 50),
      new WindField(vec3(4, 5, 1), vec3(-1, -1, 0), 40),
    ];
    this.current_wind_field = this.wind_fields[0];
    this.last_time = 0;
  }

  render_animation(caller) {
    if (!caller.controls) {
      this.animated_children.push(caller.controls = new defs.Movement_Controls({ uniforms: this.uniforms }));
      caller.controls.add_mouse_controls(caller.canvas);
      Shader.assign_camera(Mat4.look_at(vec3(5, 8, 15), vec3(0, 5, 0), vec3(0, 1, 0)), this.uniforms);
    }
    this.uniforms.projection_transform = Mat4.perspective(Math.PI / 4, caller.width / caller.height, 1, 100);

    const t = this.uniforms.animation_time / 1000;
    const dt = Math.min(1 / 60, t - this.last_time);
    this.last_time = t;

    this.uniforms.lights = [defs.Phong_Shader.light_source(vec4(22, 33, 0, 1), color(1, 1, 1, 1), 10000000000000)];

    const floor_transform = Mat4.translation(0, 0, 0).times(Mat4.scale(50, 0.01, 50));
    this.shapes.ground.draw(caller, this.uniforms, floor_transform, this.materials.soil);

    const sky_transform = Mat4.translation(0, 0, 0).times(Mat4.scale(50, 50, 50));
    this.shapes.sky.draw(caller, this.uniforms, sky_transform, this.materials.sky);

    this.current_wind_field.update(this.dandelion1, dt);
    this.dandelion1.draw(caller, this.uniforms, this.materials.plastic);

    const colors = [color(1, 0.7, 0, 1), color(0.7, 1, 1, 1), color(0, 1, 0, 1)];
    for (let i = 0; i < this.wind_fields.length; i++) {
      const transform = Mat4.translation(...this.wind_fields[i].source_point).times(Mat4.scale(0.3, 0.3, 0.3));
      this.shapes.ball.draw(caller, this.uniforms, transform, { ...this.materials.plastic, color: colors[i] });
    }
  }

  render_controls() {
    this.key_triggered_button("Wind Field 1", ["1"], () => { this.current_wind_field = this.wind_fields[0]; });
    this.key_triggered_button("Wind Field 2", ["2"], () => { this.current_wind_field = this.wind_fields[1]; });
    this.key_triggered_button("Wind Field 3", ["3"], () => { this.current_wind_field = this.wind_fields[2]; });
  }
}