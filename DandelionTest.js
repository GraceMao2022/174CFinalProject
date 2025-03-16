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
    this.dandelion2 = new Dandelion(vec3(-5, 0, 0)); // Left
    this.dandelion3 = new Dandelion(vec3(5, 0, 0));   // Right
    this.dandelion4 = new Dandelion(vec3(0, 0, -5));  // Back
    this.dandelion5 = new Dandelion(vec3(0, 0, 5));   // Front


    this.wind_fields = [
      new WindField(vec3(8, 12, 0), vec3(-1, -1.5, 0), 20),
      new WindField(vec3(3, 2, 5), vec3(-3, -2, -5), 50),
      new WindField(vec3(4, 5, 1), vec3(-1, -1, 0), 40),
    ];

    this.t_sim = 0;
    this.t_step = 0.001;

    this.active_wind_fields = [];
    this.user_wind_field = null;
    this.current_wind_field = this.wind_fields[0];

    // Setup interactive controls for wind
    // this.is_blowing = false;
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

    // add user wind to active wind
    if (this.user_wind_field !== null)
      this.active_wind_fields.push(this.user_wind_field);

    let t_next = this.t_sim + dt;
    for (; this.t_sim <= t_next; this.t_sim += this.t_step) {
      // update all active wind fields
      for (let i = 0; i < this.active_wind_fields.length; i++)
        this.active_wind_fields[i].update(dt);

      this.dandelion1.update(this.t_step, this.active_wind_fields);
      // this.dandelion2.update(this.t_step, this.active_wind_fields);
      // this.dandelion3.update(this.t_step, this.active_wind_fields);
      // this.dandelion4.update(this.t_step, this.active_wind_fields);
      // this.dandelion5.update(this.t_step, this.active_wind_fields);
    }

    // Visualize wind direction (optional)
    this.draw_wind_indicator(caller);

    // pop user wind off of active wind stack
    if (this.user_wind_field !== null)
      this.active_wind_fields.pop();

    this.dandelion1.draw(caller, this.uniforms, this.materials.plastic);
    // this.dandelion2.draw(caller, this.uniforms, this.materials.plastic);
    // this.dandelion3.draw(caller, this.uniforms, this.materials.plastic);
    // this.dandelion4.draw(caller, this.uniforms, this.materials.plastic);
    // this.dandelion5.draw(caller, this.uniforms, this.materials.plastic);

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
      this.user_blow(blow_direction, 500.0);
    };

    // Add event listeners
    canvas.addEventListener('mousedown', blow_handler);
    canvas.addEventListener('touchstart', (event) => {
      event.preventDefault();
      blow_handler(event.touches[0]);
    });
  }

  user_blow(direction, strength) {
    // this.is_blowing = true;

    // TODO: change source_point to match actual camera pos
    this.user_wind_field = new WindField(vec3(5, 8, 15), direction, strength);

    // Reset any existing timeout
    if (this.blow_timeout) {
      clearTimeout(this.blow_timeout);
    }

    // Schedule return to normal wind
    this.blow_timeout = setTimeout(() => {
      // this.is_blowing = false;
      this.user_wind_field = null;
    }, 1000);
  }

  draw_wind_indicator(caller) {
    if (this.active_wind_fields.length > 0) {
      // Draw an arrow showing wind direction
      let accum_force = vec3(0, 0, 0);
      for (let i = 0; i < this.active_wind_fields.length; i++) {
        accum_force.add_by(this.active_wind_fields[i].direction.times(this.active_wind_fields[i].magnitude));
      }
      let direction = accum_force.normalized();
      // console.log(direction)
      // console.log(accum_force.norm())

      const indicator_pos = vec3(-8, 6, -8);
      const indicator_length = accum_force.norm() * 0.1;

      const arrow_transform = Mat4.scale(0.1, 0.1, indicator_length);

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
  }

  render_controls() {
    this.key_triggered_button("Wind Field 1", ["1"], () => { this.active_wind_fields.push(this.wind_fields[0]); });
    this.key_triggered_button("Wind Field 2", ["2"], () => { this.active_wind_fields.push(this.wind_fields[1]); });
    this.key_triggered_button("Wind Field 3", ["3"], () => { this.active_wind_fields.push(this.wind_fields[2]); });
    this.key_triggered_button("No Wind", ["4"], () => { this.active_wind_fields = []; });
    this.key_triggered_button("Detach Enable/Disable", ["5"], () => { this.dandelion1.detach_enabled = !this.dandelion1.detach_enabled });
  }
}