import { tiny, defs } from './examples/common.js';
import { Dandelion } from './Dandelion.js';
import { WindField } from './WindField.js';

// Pull these names into this module's scope for convenience:
const { vec3, vec4, color, Mat4, Shape, Material, Shader, Texture, Component } = tiny;

export class DandelionTest extends Component {
  init() {
    console.log("init")

    // this.hover = this.swarm = false;

    this.shapes = {
      'box': new defs.Cube(),
      'ground': new defs.Cube(),
      'ball': new defs.Subdivision_Sphere(4),
      'sky': new defs.Subdivision_Sphere(4),
      'axis': new defs.Axis_Arrows(),
      'sphere': new defs.Subdivision_Sphere(5),
      'cylinder': new defs.Cylindrical_Tube(20, 20, [[0, 0], [0, 0]])
      // "seed": new Shape_From_File("./assets/leaf2.obj")
    };

    this.materials = {
      plastic: { shader: new defs.Phong_Shader(), ambient: .2, diffusivity: 1, specularity: .5, color: color(.9, .5, .9, 1) },
      rgb: { shader: new defs.Textured_Phong(), ambient: .5, texture: new Texture("assets/rgb.jpg") },
      soil: { shader: new defs.Textured_Phong(), color: color(0, 0, 0, 1), ambient: 0.5, diffusivity: .5, specularity: 0, texture: new Texture("assets/soil2.jpeg") },
      sky: { shader: new defs.Textured_Phong(), color: color(0, 0, 0, 1), ambient: 1, diffusivity: .5, specularity: .2, texture: new Texture("assets/sky.jpeg", "NPOT") },
    };

    this.shapes.ground.arrays.texture_coord.forEach(v => { v[0] *= 15; v[1] *= 15; });

    this.dandelion1 = new Dandelion(vec3(0, 0, 0));
    this.wind_fields = [
      new WindField(vec3(8, 12, 0), vec3(-1, -1.5, 0), 20),
      new WindField(vec3(3, 2, 5), vec3(-3, -2, -5), 50),
      new WindField(vec3(4, 5, 1), vec3(-1, -1, 0), 40),
    ];

    this.t_sim = 0;
    this.t_step = 0.001;

    // this.active_wind_fields = [];
    this.current_wind_field = this.wind_fields[0];

    // Setup interactive controls for wind
    this.wind_strength = 2.0;
    this.wind_direction = vec3(1, 0.2, 0).normalized();
    this.is_blowing = false;
    this.blow_timeout = null;
  }

  render_animation(caller) {                                                // display():  Called once per frame of animation.  We'll isolate out
    if (!caller.controls) {
      this.animated_children.push(caller.controls = new defs.Movement_Controls({ uniforms: this.uniforms }));
      caller.controls.add_mouse_controls(caller.canvas);

      // Camera setup
      Shader.assign_camera(Mat4.look_at(vec3(5, 8, 15), vec3(0, 5, 0), vec3(0, 1, 0)), this.uniforms);

      // Add click listener to blow on dandelion
      this.add_blow_interaction(caller.canvas);
    }
    this.uniforms.projection_transform = Mat4.perspective(Math.PI / 4, caller.width / caller.height, 1, 100);

    const light_position = vec4(22, 33, 0, 1.0);
    this.uniforms.lights = [defs.Phong_Shader.light_source(light_position, color(1, 1, 1, 1), 10000000000000)];

    const t = this.t = this.uniforms.animation_time / 1000;

    // Calculate delta time for physics
    let dt = Math.min(1 / 60, this.uniforms.animation_delta_time / 1000)

    // !!! Draw ground
    let floor_transform = Mat4.translation(0, 0, 0).times(Mat4.scale(50, 0.01, 50));
    this.shapes.ground.draw(caller, this.uniforms, floor_transform, this.materials.soil);

    // draw sky sphere
    let sky_transform = Mat4.translation(0, 0, 0).times(Mat4.scale(50, 50, 50));
    this.shapes.sky.draw(caller, this.uniforms, sky_transform, this.materials.sky);

    this.current_wind_field.update(dt);

    let t_next = this.t_sim + dt;
    for (; this.t_sim <= t_next; this.t_sim += this.t_step) {
      this.dandelion1.update(this.t_step, this.current_wind_field);
      // this.dandelion2.update(this.t_step, this.wind_field);
      // this.dandelion3.update(this.t_step, this.wind_field);
    }
    this.dandelion1.draw(caller, this.uniforms, this.materials.plastic);
    // this.dandelion2.draw(caller, this.uniforms, this.materials.plastic);
    // this.dandelion3.draw(caller, this.uniforms, this.materials.plastic);

    // Draw dandelion
    //this.dandelion.draw(caller, this.uniforms, this.materials.plastic);

    // Visualize wind direction (optional)
    this.draw_wind_indicator(caller);

    // Update wind parameters with time-based variations
    // this.update_wind(t, dt);

    // draw axis arrows.
    // this.shapes.axis.draw(caller, this.uniforms, Mat4.identity(), this.materials.rgb);

    const colors = [color(1, 0.7, 0, 1), color(0.7, 1, 1, 1), color(0, 1, 0, 1)];
    for (let i = 0; i < this.wind_fields.length; i++) {
      const transform = Mat4.translation(...this.wind_fields[i].source_point).times(Mat4.scale(0.3, 0.3, 0.3));
      this.shapes.ball.draw(caller, this.uniforms, transform, { ...this.materials.plastic, color: colors[i] });
    }
  }

  add_blow_interaction(canvas) {
    // Add mouse/touch event listeners to blow on the dandelion
    const blow_handler = (event) => {
      // Calculate blow direction based on canvas coordinates
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left - rect.width / 2;
      const y = -(event.clientY - rect.top - rect.height / 2);

      // Create a blow direction from camera towards click position
      const camera_pos = vec3(5, 8, 15);
      const blow_target = vec3(x / 20, y / 20, 0);
      const blow_direction = blow_target.minus(camera_pos).normalized();

      // Apply user blow
      this.user_blow(blow_direction, 5.0);
    };

    // Add event listeners
    canvas.addEventListener('mousedown', blow_handler);
    canvas.addEventListener('touchstart', (event) => {
      event.preventDefault();
      blow_handler(event.touches[0]);
    });
  }

  user_blow(direction, strength) {
    this.is_blowing = true;
    this.wind_direction = direction;
    this.wind_strength = strength;

    // Reset any existing timeout
    if (this.blow_timeout) {
      clearTimeout(this.blow_timeout);
    }

    // Schedule return to normal wind
    this.blow_timeout = setTimeout(() => {
      this.is_blowing = false;
    }, 1000);
  }

  // update_wind(t, dt) {
  //   if (dt <= 0 || dt > 0.1) dt = 0.016; // Handle first frame or pauses

  //   // Base wind parameters
  //   if (!this.is_blowing) {
  //     // Normal wind state - slowly shifts direction and strength
  //     this.wind_strength = 2.0 + Math.sin(t * 0.2) * 1.5;

  //     const angle = t * 0.05;
  //     // this.wind_direction = vec3(
  //     //   Math.cos(angle),
  //     //   0.2 + Math.sin(angle * 0.3) * 0.1,
  //     //   Math.sin(angle)
  //     // ).normalized();
  //     this.wind_direction = vec3(
  //       0, 0, 0
  //     );
  //   }

  //   // Update windField parameters
  //   this.windField.strength = this.wind_strength;
  //   this.windField.direction = this.wind_direction;

  //   // Update the simulation
  //   this.windField.update(dt);
  // }

  draw_wind_indicator(caller) {
    // Draw an arrow showing wind direction
    const indicator_pos = vec3(-8, 6, -8);
    const indicator_length = this.wind_strength * 0.5;

    const arrow_transform = Mat4.scale(0.1, 0.1, indicator_length);
    const direction = this.wind_direction;

    // Calculate rotation to align with wind direction
    const z_axis = vec3(0, 0, 1);
    const rotation_axis = z_axis.cross(direction).normalized();
    const angle = Math.acos(z_axis.dot(direction));

    arrow_transform.pre_multiply(Mat4.rotation(angle, rotation_axis[0], rotation_axis[1], rotation_axis[2]));
    arrow_transform.pre_multiply(Mat4.translation(indicator_pos[0], indicator_pos[1], indicator_pos[2]));

    // Draw the wind arrow
    this.shapes.cylinder.draw(caller, this.uniforms, arrow_transform, {
      ...this.materials.plastic,
      color: color(0.5, 0.7, 1, 0.8)
    });

    // Draw arrow head
    const head_transform = Mat4.scale(0.2, 0.2, 0.2);
    const tip_pos = indicator_pos.plus(direction.times(indicator_length));
    head_transform.pre_multiply(Mat4.translation(tip_pos[0], tip_pos[1], tip_pos[2]));
    this.shapes.sphere.draw(caller, this.uniforms, head_transform, {
      ...this.materials.plastic,
      color: color(0.5, 0.7, 1, 1)
    });
  }

  render_controls() {
    this.key_triggered_button("Wind Field 1", ["1"], () => { this.current_wind_field = this.wind_fields[0]; });
    this.key_triggered_button("Wind Field 2", ["2"], () => { this.current_wind_field = this.wind_fields[1]; });
    this.key_triggered_button("Wind Field 3", ["3"], () => { this.current_wind_field = this.wind_fields[2]; });
  }
}


// export class DandelionTest extends DandelionTest_base {
//   render_animation(caller) {                                                // display():  Called once per frame of animation.  For each shape that you want to
//     super.render_animation(caller);

//     const blue = color(0, 0, 1, 1), yellow = color(1, 0.7, 0, 1),
//       wall_color = color(0.7, 1.0, 0.8, 1),
//       blackboard_color = color(0.2, 0.2, 0.2, 1),
//       pink = color(0.9, 0.7, 0.7, 1);

//     const t = this.t = this.uniforms.animation_time / 1000;

//     // !!! Draw ground
//     let floor_transform = Mat4.translation(0, 0, 0).times(Mat4.scale(50, 0.01, 50));
//     this.shapes.ground.draw(caller, this.uniforms, floor_transform, this.materials.soil);

//     // draw sky sphere
//     let sky_transform = Mat4.translation(0, 0, 0).times(Mat4.scale(50, 50, 50));
//     this.shapes.sky.draw(caller, this.uniforms, sky_transform, this.materials.sky);

//     // Draw dandelion
//     //this.dandelion.draw(caller, this.uniforms, this.materials.plastic);

//     // Draw detached seeds
//     this.draw_detached_seeds(caller);

//     // Visualize wind direction (optional)
//     this.draw_wind_indicator(caller);

//     // if (this.t_sim > 8) {
//     //   console.log("no wind")
//     //   this.wind_field = null
//     // }
//     // else if (this.t_sim < 2) {
//     //   this.wind_field = this.wind_field_1
//     //   let wind_transform = Mat4.translation(this.source_point_1[0], this.source_point_1[1], this.source_point_1[2]).times(Mat4.scale(0.3, 0.3, 0.3));
//     //   this.shapes.ball.draw(caller, this.uniforms, wind_transform, { ...this.materials.plastic, color: yellow });
//     // }
//     // else if (this.t_sim < 4) {
//     //   console.log("no wind")
//     //   this.wind_field = null
//     // }
//     // else if (this.t_sim < 6) {
//     //   this.wind_field = this.wind_field_2
//     //   let wind_transform = Mat4.translation(this.source_point_2[0], this.source_point_2[1], this.source_point_2[2]).times(Mat4.scale(0.3, 0.3, 0.3));
//     //   this.shapes.ball.draw(caller, this.uniforms, wind_transform, { ...this.materials.plastic, color: yellow });
//     // }
//     // else if (this.t_sim <= 8) {
//     //   this.wind_field = this.wind_field_3
//     //   let wind_transform = Mat4.translation(this.source_point_3[0], this.source_point_3[1], this.source_point_3[2]).times(Mat4.scale(0.3, 0.3, 0.3));
//     //   this.shapes.ball.draw(caller, this.uniforms, wind_transform, { ...this.materials.plastic, color: yellow });
//     // }

//     let dt = Math.min(1 / 60, this.uniforms.animation_delta_time / 1000)
//     let t_next = this.t_sim + dt;
//     for (; this.t_sim <= t_next; this.t_sim += this.t_step) {
//       this.dandelion1.update(this.t_step, this.windField);
//       // this.dandelion2.update(this.t_step, this.wind_field);
//       // this.dandelion3.update(this.t_step, this.wind_field);
//     }
//     this.dandelion1.draw(caller, this.uniforms, this.materials.plastic);
//     // this.dandelion2.draw(caller, this.uniforms, this.materials.plastic);
//     // this.dandelion3.draw(caller, this.uniforms, this.materials.plastic);
//   }

//   draw_detached_seeds(caller) {
//     // Draw all detached seeds being carried by the wind
//     for (const seed of this.windField.detached_seeds) {
//       // Draw seed stalk
//       const stalk_transform = Mat4.scale(0.05, 0.05, 0.15);
//       stalk_transform.pre_multiply(Mat4.rotation(Math.PI / 2, 1, 0, 0));
//       stalk_transform.pre_multiply(Mat4.translation(seed.pos[0], seed.pos[1], seed.pos[2]));
//       this.shapes.cylinder.draw(caller, this.uniforms, stalk_transform, {
//         ...this.materials.seed,
//         color: color(0.8, 0.7, 0.6, 1)
//       });

//       // Draw seed fluff
//       const fluff_transform = Mat4.scale(0.1, 0.1, 0.1);
//       fluff_transform.pre_multiply(Mat4.translation(seed.pos[0], seed.pos[1] + 0.15, seed.pos[2]));
//       this.shapes.sphere.draw(caller, this.uniforms, fluff_transform, {
//         ...this.materials.seed,
//         color: color(1, 1, 1, 0.8)
//       });
//     }
//   }

//   draw_wind_indicator(caller) {
//     // Draw an arrow showing wind direction
//     const indicator_pos = vec3(-8, 6, -8);
//     const indicator_length = this.wind_strength * 0.5;

//     const arrow_transform = Mat4.scale(0.1, 0.1, indicator_length);
//     const direction = this.wind_direction;

//     // Calculate rotation to align with wind direction
//     const z_axis = vec3(0, 0, 1);
//     const rotation_axis = z_axis.cross(direction).normalized();
//     const angle = Math.acos(z_axis.dot(direction));

//     arrow_transform.pre_multiply(Mat4.rotation(angle, rotation_axis[0], rotation_axis[1], rotation_axis[2]));
//     arrow_transform.pre_multiply(Mat4.translation(indicator_pos[0], indicator_pos[1], indicator_pos[2]));

//     // Draw the wind arrow
//     this.shapes.cylinder.draw(caller, this.uniforms, arrow_transform, {
//       ...this.materials.plastic,
//       color: color(0.5, 0.7, 1, 0.8)
//     });

//     // Draw arrow head
//     const head_transform = Mat4.scale(0.2, 0.2, 0.2);
//     const tip_pos = indicator_pos.plus(direction.times(indicator_length));
//     head_transform.pre_multiply(Mat4.translation(tip_pos[0], tip_pos[1], tip_pos[2]));
//     this.shapes.sphere.draw(caller, this.uniforms, head_transform, {
//       ...this.materials.plastic,
//       color: color(0.5, 0.7, 1, 1)
//     });
//   }

//   render_controls() {
//     // Add any control UI elements here if needed
//     return [
//       ["Wind Strength", this.wind_strength],
//       ["Seeds Detached", this.windField.detached_seeds.length]
//     ];
//   }
// }
