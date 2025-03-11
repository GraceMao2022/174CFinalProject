import { tiny, defs } from './examples/common.js';

// Pull these names into this module's scope for convenience:
const { vec3, vec4, color, Mat4, Shape, Material, Shader, Texture, Component } = tiny;

// Import required classes
import { Dandelion } from './Dandelion.js';
import { WindField } from './WindField.js';

export
const DandelionTest_base = defs.DandelionTest_base =
    class DandelionTest_base extends Component {

      init() {
        console.log("init")

        this.hover = this.swarm = false;

        this.shapes = {
          'box': new defs.Cube(),
          'ball': new defs.Subdivision_Sphere(4),
          'axis': new defs.Axis_Arrows(),
          'sphere': new defs.Subdivision_Sphere(5),
          'cylinder': new defs.Cylindrical_Tube(20, 20, [[0, 0], [0, 0]])
        };

        const basic = new defs.Basic_Shader();
        const phong = new defs.Phong_Shader();
        const tex_phong = new defs.Textured_Phong();
        this.materials = {};
        this.materials.plastic = { shader: phong, ambient: .2, diffusivity: 1, specularity: .5, color: color(.9, .5, .9, 1) }
        this.materials.metal = { shader: phong, ambient: .2, diffusivity: 1, specularity: 1, color: color(.9, .5, .9, 1) }
        this.materials.rgb = { shader: tex_phong, ambient: .5, texture: new Texture("assets/rgb.jpg") }
        this.materials.seed = { shader: phong, ambient: .3, diffusivity: 0.8, specularity: 0.2, color: color(1, 1, 1, 1) }


        // Create Dandelion instance
        this.dandelion = new Dandelion(vec3(0, 0, 0));

        // Create WindField instance
        this.windField = new WindField({
          strength: 2.0,
          direction: vec3(1, 0.2, 0).normalized(),
          variability: 0.4,
          frequency: 0.3,
          spring_constant: 15,
          damping_constant: 1.2
        });

        // Setup interactive controls for wind
        this.wind_strength = 2.0;
        this.wind_direction = vec3(1, 0.2, 0).normalized();
        this.is_blowing = false;
        this.blow_timeout = null;

        // Track time
        this.last_time = 0;
      }

      render_animation(caller) {
        if (!caller.controls) {
          this.animated_children.push(caller.controls = new defs.Movement_Controls({ uniforms: this.uniforms }));
          caller.controls.add_mouse_controls(caller.canvas);

          // Camera setup
          Shader.assign_camera(Mat4.look_at(vec3(5, 8, 15), vec3(0, 5, 0), vec3(0, 1, 0)), this.uniforms);

          // Add click listener to blow on dandelion
          this.add_blow_interaction(caller.canvas);
        }
        this.uniforms.projection_transform = Mat4.perspective(Math.PI / 4, caller.width / caller.height, 1, 100);

        const t = this.t = this.uniforms.animation_time / 1000;

        // Calculate delta time for physics
        const dt = t - this.last_time;
        this.last_time = t;

        // Update wind parameters with time-based variations
        this.update_wind(t, dt);

        const light_position = vec4(20, 20, 20, 1.0);
        this.uniforms.lights = [defs.Phong_Shader.light_source(light_position, color(1, 1, 1, 1), 1000000)];

        this.shapes.axis.draw(caller, this.uniforms, Mat4.identity(), this.materials.rgb);
      }

      add_blow_interaction(canvas) {
        // Add mouse/touch event listeners to blow on the dandelion
        const blow_handler = (event) => {
          // Get current camera position from the controls
          const camera_position = this.uniforms.camera_transform.times(vec4(0, 0, 0, 1)).to3();

          // Calculate click position in 3D space
          const rect = canvas.getBoundingClientRect();

          // Normalize click coordinates to [-1, 1] range
          const normalized_x = 2 * (event.clientX - rect.left) / rect.width - 1;
          const normalized_y = -2 * (event.clientY - rect.top) / rect.height + 1;

          // Get camera's view direction and orientation
          const inv_camera = Mat4.inverse(this.uniforms.camera_transform);
          const forward = inv_camera.times(vec4(0, 0, -1, 0)).to3().normalized();
          const up = inv_camera.times(vec4(0, 1, 0, 0)).to3().normalized();
          const right = forward.cross(up).normalized();

          // Create a ray from camera through clicked point
          const fov = Math.PI / 4; // From your perspective call
          const aspect = rect.width / rect.height;
          const tan_fov = Math.tan(fov / 2);

          // Direction in camera space
          const ray_direction = vec3(
              normalized_x * aspect * tan_fov,
              normalized_y * tan_fov,
              -1 // Forward in camera space
          ).normalized();

          // Transform to world space
          const world_ray = vec3(
              right.dot(ray_direction),
              up.dot(ray_direction),
              forward.dot(ray_direction)
          ).normalized();

          // Apply user blow from camera towards clicked position
          this.user_blow(world_ray, 5.0);
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

      update_wind(t, dt) {
        if (dt <= 0 || dt > 0.1) dt = 0.016; // Handle first frame or pauses

        // Base wind parameters
        if (!this.is_blowing) {
          // Normal wind state - slowly shifts direction and strength
          this.wind_strength = 2.0 + Math.sin(t * 0.2) * 1.5;

          const angle = t * 0.05;
          this.wind_direction = vec3(
              Math.cos(angle),
              0.2 + Math.sin(angle * 0.3) * 0.1,
              Math.sin(angle)
          ).normalized();
        }

        // Update windField parameters
        this.windField.strength = this.wind_strength;
        this.windField.direction = this.wind_direction;

        // Update the simulation
        this.windField.update(this.dandelion, dt);
      }
    }

export class DandelionTest extends DandelionTest_base {
  render_animation(caller) {
    super.render_animation(caller);

    const blue = color(0, 0, 1, 1),
        yellow = color(1, 0.7, 0, 1),
        wall_color = color(0.7, 1.0, 0.8, 1),
        blackboard_color = color(0.2, 0.2, 0.2, 1),
        pink = color(0.9, 0.7, 0.7, 1),
        green = color(0, 0.8, 0.2, 1);

    const t = this.t = this.uniforms.animation_time / 1000;

    // Draw ground
    let floor_transform = Mat4.translation(0, 0, 0).times(Mat4.scale(10, 0.01, 10));
    this.shapes.box.draw(caller, this.uniforms, floor_transform, { ...this.materials.plastic, color: yellow });

    // Draw dandelion
    this.dandelion.draw(caller, this.uniforms, this.materials.plastic);

    // Draw detached seeds
    this.draw_detached_seeds(caller);

    // Visualize wind direction (optional)
    this.draw_wind_indicator(caller);
  }

  draw_detached_seeds(caller) {
    // Draw all detached seeds being carried by the wind
    for (const seed of this.windField.detached_seeds) {
      // Draw seed stalk
      const stalk_transform = Mat4.scale(0.05, 0.05, 0.15);
      stalk_transform.pre_multiply(Mat4.rotation(Math.PI/2, 1, 0, 0));
      stalk_transform.pre_multiply(Mat4.translation(seed.pos[0], seed.pos[1], seed.pos[2]));
      this.shapes.cylinder.draw(caller, this.uniforms, stalk_transform, {
        ...this.materials.seed,
        color: color(0.8, 0.7, 0.6, 1)
      });

      // Draw seed fluff
      const fluff_transform = Mat4.scale(0.1, 0.1, 0.1);
      fluff_transform.pre_multiply(Mat4.translation(seed.pos[0], seed.pos[1] + 0.15, seed.pos[2]));
      this.shapes.sphere.draw(caller, this.uniforms, fluff_transform, {
        ...this.materials.seed,
        color: color(1, 1, 1, 0.8)
      });
    }
  }

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
    // Add any control UI elements here if needed
    return [
      ["Wind Strength", this.wind_strength],
      ["Seeds Detached", this.windField.detached_seeds.length]
    ];
  }
}