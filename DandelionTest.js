import { tiny, defs } from './examples/common.js';

const { vec3, vec4, color, Mat4, Shape, Material, Shader, Texture, Component } = tiny;
const { Textured_Phong } = defs;

import { Dandelion } from './Dandelion.js';
import { WindField } from './WindField.js';

export const DandelionTest_base = defs.DandelionTest_base =
    class DandelionTest_base extends Component {
      init() {
        console.log("init");

        this.hover = this.swarm = false;

        this.shapes = {
          'box': new defs.Cube(),
          'ground': new defs.Cube(),
          'ball': new defs.Subdivision_Sphere(4),
          'sky': new defs.Subdivision_Sphere(4),
          'axis': new defs.Axis_Arrows(),
          'sphere': new defs.Subdivision_Sphere(5),
          'cylinder': new defs.Cylindrical_Tube(20, 20, [[0, 0], [0, 0]])
        };

        const phong = new defs.Phong_Shader();
        const tex_phong = new defs.Textured_Phong();
        this.materials = {
          plastic: { shader: phong, ambient: .2, diffusivity: 1, specularity: .5, color: color(.9, .5, .9, 1) },
          soil: { shader: tex_phong, color: color(0, 0, 0, 1), ambient: 0.5, diffusivity: .5, specularity: 0, texture: new Texture("assets/soil2.jpeg") },
          sky: { shader: tex_phong, color: color(0, 0, 0, 1), ambient: 1, diffusivity: .5, specularity: .2, texture: new Texture("assets/sky.jpeg") },
          seed: { shader: phong, ambient: .3, diffusivity: 0.8, specularity: 0.2, color: color(1, 1, 1, 1) }
        };

        this.shapes.ground.arrays.texture_coord.forEach(v => {
          v[0] *= 15;
          v[1] *= 15;
        });

        this.dandelion1 = new Dandelion(vec3(0, 0, 0));
        this.t_sim = 0;
        this.t_step = 0.016; // Increased from 0.001 to match ~60 FPS

        this.source_point_1 = vec3(8, 12, 0);
        let direction_1 = vec3(-1, -1.5, 0);
        let magnitude_1 = 20;
        this.wind_field_1 = new WindField(this.source_point_1, direction_1, magnitude_1);

        this.source_point_2 = vec3(3, 2, 5);
        let direction_2 = vec3(3, -4, 0);
        let magnitude_2 = 6;
        this.wind_field_2 = new WindField(this.source_point_2, direction_2, magnitude_2);

        this.source_point_3 = vec3(0, 8, 0);
        let direction_3 = vec3(0, -1, 0);
        let magnitude_3 = 6;
        this.wind_field_3 = new WindField(this.source_point_3, direction_3, magnitude_3);

        this.current_wind_field = this.wind_field_1;
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

        this.uniforms.lights = [defs.Phong_Shader.light_source(vec4(22, 33, 0, 1.0), color(1, 1, 1, 1), 10000000000000)];
        this.shapes.axis.draw(caller, this.uniforms, Mat4.identity(), this.materials.plastic);
      }
    };

export class DandelionTest extends DandelionTest_base {
  render_animation(caller) {
    super.render_animation(caller);

    const yellow = color(1, 0.7, 0, 1);
    const blue = color(0.7, 1.0, 1.0, 1);
    const green = color(0, 1.0, 0, 1);

    // Draw ground
    let floor_transform = Mat4.translation(0, 0, 0).times(Mat4.scale(50, 0.01, 50));
    this.shapes.ground.draw(caller, this.uniforms, floor_transform, this.materials.soil);

    // Draw sky sphere
    let sky_transform = Mat4.translation(0, 0, 0).times(Mat4.scale(50, 50, 50));
    this.shapes.sky.draw(caller, this.uniforms, sky_transform, this.materials.sky);

    // Update simulation
    let dt = Math.min(1 / 60, this.uniforms.animation_delta_time / 1000);
    let t_next = this.t_sim + dt;
    for (; this.t_sim <= t_next; this.t_sim += this.t_step) {
      this.dandelion1.update(this.t_step, this.current_wind_field); // Use current_wind_field
    }

    // Draw dandelion
    this.dandelion1.draw(caller, this.uniforms, this.materials.plastic);

    // Draw detached seeds
    this.current_wind_field.drawDetachedSeeds(caller, this.uniforms, this.shapes, this.materials.seed);

    // Visualize wind sources
    let wind_transform_1 = Mat4.translation(this.source_point_1[0], this.source_point_1[1], this.source_point_1[2]).times(Mat4.scale(0.3, 0.3, 0.3));
    this.shapes.ball.draw(caller, this.uniforms, wind_transform_1, { ...this.materials.plastic, color: yellow });

    let wind_transform_2 = Mat4.translation(this.source_point_2[0], this.source_point_2[1], this.source_point_2[2]).times(Mat4.scale(0.3, 0.3, 0.3));
    this.shapes.ball.draw(caller, this.uniforms, wind_transform_2, { ...this.materials.plastic, color: blue });

    let wind_transform_3 = Mat4.translation(this.source_point_3[0], this.source_point_3[1], this.source_point_3[2]).times(Mat4.scale(0.3, 0.3, 0.3));
    this.shapes.ball.draw(caller, this.uniforms, wind_transform_3, { ...this.materials.plastic, color: green });
  }

  render_controls() {
    this.key_triggered_button("Wind Field 1 (Right-Down)", ["w", "1"], () => {
      this.current_wind_field = this.wind_field_1;
      console.log("Switched to Wind Field 1");
    });

    this.key_triggered_button("Wind Field 2 (Left-Up)", ["w", "2"], () => {
      this.current_wind_field = this.wind_field_2;
      console.log("Switched to Wind Field 2");
    });

    this.key_triggered_button("Wind Field 3 (Down)", ["w", "3"], () => {
      this.current_wind_field = this.wind_field_3;
      console.log("Switched to Wind Field 3");
    });

    this.key_triggered_button("Debug Info", ["Shift", "D"], () => {
      console.log(`Current Wind Source: (${this.current_wind_field.source_point.toString()})`);
      console.log(`Direction: (${this.current_wind_field.direction.toString()})`);
      console.log(`Magnitude: ${this.current_wind_field.magnitude}`);
      console.log(`Seeds Detached: ${this.current_wind_field.detached_seeds.length}`);
    });
  }
}