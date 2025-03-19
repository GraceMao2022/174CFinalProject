Overview

Our project is a visually-aesthetic and intricately-animated dandelion field. It was created using tinygraphics.js and Blender for the dandelion and baby dandelion models.

Components
1. Dandelion seed and stem bending

Dandelion seed and stem bending were handled inside Dandelion.js. 

A dandelion is composed of multiple nodes and arcs to form one articulated kinematics body. Each seed has a corresponding arc where it is attached to the middle of the flower. When forces from wind are detected at the end effectors of the seeds (at the tips), a torque is computed and the joint angles are rotated based on it. A mass-spring-damper system works to bring the seeds' joint angles back to original by adding a corresponding rotational spring force opposing the wind torque.

The stem bending is taken care of in a similar way to seed bending. The stem is divided into multiple stem segments, each attached to the previous segment via an arc. When a force is detected at the receptacle (flower pod at the top of flower), a torque is computed for each segment based on the wind force and their distance to the root of the flower (very bottom on the ground). Then, the joint angles for each stem segment were computed. A similar rotational mass-spring-damper system is used for each stem segment in order to bring them back to their original positions.

2. Dandelion detachment
3. Dandelion detached seed movement
4. Wind field

The wind field is handled inside WindField.js.

_____ (how force is calculated based on position)

There are two types of wind fields: a static and a moving one. The static wind field keeps its source point stationary, while a moving wind field will gradually move its source point in the wind's defined direction.

Multiple wind fields can exist at once and will cumulatively affect each seed/stem segment.

5. User interaction

User interaction is handled in DandelionTest.js in Lines 161-209.

Whenever the user clicks on the screen, a moving wind force is created with its direction based on the vector from the center of the screen to where they clicked. This is done by using the camera_inverse and projection matrices to compute where the camera is in global coordinates, and using canvas.getBoundingClientRect() to calculate where the user clicked on the screen.

Algorithms
1. Mass-spring-damper system

This determines how dandelion seeds and stem segments rotate back to original positions.

This is handled in Dandelion.js, in Lines 447-466 for the seeds and 510-525 for the stem.

2. Symplectic Euler integration

This determines how the dandelion seeds rotate while attached to receptacle, and how stem segments bend.

This is handled in Dandelion.js, in Lines 440-445 for the seeds and Lines 503-508 for the stem.

3. Articulated kinematics

The stem is made of multiple joints to allow it to bend, and the dandelion seeds are attached via joints to receptacle to allow them to rotate.

The dandelion's articulated kinematics model is initalized in lines 25-69 in Dandelion.js, and Lines 199-251 for the seeds and stem segments specifically.

4. Hermite splines

This determines the path that dandelion seeds follow once they detach, with control point positions and locations based on the wind force that caused the seed to detach.

This is done in the majority of DetachedSeed.js.

Other features
- Baby dandelions that have stem bending
- Skybox (sphere) and grass
- Each dandelion/baby dandelion has corresponding leaves at random rotations

Challenges
- One of the biggest challenges was importing non-power-of-two textures into tinygraphics, as they would simply not show up. The solution was to modify tinygraphics.js such that the filtering mode did not use mipmapping and instead used clamp to edge.
- Another one of our initial challenges was that the seeds were detaching too fast when we were detecting based on wind force. The solution was to detach once the seeds got past a certain joint angle instead, which also was more realistic.

Team Contribution
- Lauren Byun:
- Parsa Hajipour:
- Grace Mao: Dandelion articulated model, seed rotation, stem bending, user-generated wind, model importing

Credits:
Assets
- Dandelion leaf model: https://www.turbosquid.com/3d-models/dandelion-plant-709989
- Grass model: https://free3d.com/3d-model/grass-74284.html 
- Soil texture: https://stock.adobe.com/images/seamless-soil-texture-can-be-used-as-pattern-to-fill-background/148003870
- Sky texture: https://devforum.roblox.com/t/how-to-make-default-sky-look-better/2094999

Code
- Fibonacci sphere algorithm for spawning seeds evenly: https://stackoverflow.com/questions/9600801/evenly-distributing-n-points-on-a-sphere