import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.118.1/build/three.module.js";

// import { Interaction } from "https://cdn.jsdelivr.net/npm/three.interaction@0.2.3/build/three.interaction.min.js";

import { third_person_camera } from "./third-person-camera.js";
import { entity_manager } from "./entity-manager.js";
import { player_entity } from "./player-entity.js";
import { entity } from "./entity.js";
import { gltf_component } from "./gltf-component.js";
import { health_component } from "./health-component.js";
import { player_input } from "./player-input.js";
import { npc_entity } from "./npc-entity.js";
import { math } from "./math.js";
import { spatial_hash_grid } from "./spatial-hash-grid.js";
import { ui_controller } from "./ui-controller.js";
import { health_bar } from "./health-bar.js";
import { level_up_component } from "./level-up-component.js";
import { quest_component } from "./quest-component.js";
import { spatial_grid_controller } from "./spatial-grid-controller.js";
import { inventory_controller } from "./inventory-controller.js";
import { equip_weapon_component } from "./equip-weapon-component.js";
import { attack_controller } from "./attacker-controller.js";
import { decorations } from "../resources/data.js";

const _VS = `
varying vec3 vWorldPosition;

void main() {
  vec4 worldPosition = modelMatrix * vec4( position, 1.0 );
  vWorldPosition = worldPosition.xyz;

  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

const _FS = `
uniform vec3 topColor;
uniform vec3 bottomColor;
uniform float offset;
uniform float exponent;

varying vec3 vWorldPosition;

void main() {
  float h = normalize( vWorldPosition + offset ).y;
  gl_FragColor = vec4( mix( bottomColor, topColor, max( pow( max( h , 0.0), exponent ), 0.0 ) ), 1.0 );
}`;

class HackNSlashDemo {
  constructor() {
    this._Initialize();
  }

  _Initialize() {
    this._threejs = new THREE.WebGLRenderer({
      antialias: true,
    });
    this._threejs.outputEncoding = THREE.sRGBEncoding;
    this._threejs.gammaFactor = 2.2;
    this._threejs.shadowMap.enabled = true;
    this._threejs.shadowMap.type = THREE.PCFSoftShadowMap;
    this._threejs.setPixelRatio(window.devicePixelRatio);
    this._threejs.setSize(window.innerWidth, window.innerHeight);
    this._threejs.domElement.id = "threejs";

    document.getElementById("container").appendChild(this._threejs.domElement);

    document.addEventListener("mousemove", (event) => {
      event.preventDefault();
      this._mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      this._mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    });
    document.addEventListener("pointerdown", (event) =>
      this._OnPointerDown(event)
    );

    window.addEventListener(
      "resize",
      () => {
        this._OnWindowResize();
      },
      false
    );

    this._raycaster = new THREE.Raycaster();

    this._mouse = new THREE.Vector2();
    this.INTERSECTED = null;

    const fov = 60;
    const aspect = 1920 / 1080;
    const near = 1.0;
    const far = 10000.0;
    this._camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this._camera.position.set(25, 10, 25);

    this._scene = new THREE.Scene();
    this._scene.background = new THREE.Color(0xffffff);
    this._scene.fog = new THREE.FogExp2(0x89b2eb, 0.002);

    let light = new THREE.DirectionalLight(0xffffff, 1.0);
    light.position.set(-10, 500, 10);
    light.target.position.set(0, 0, 0);
    // light.castShadow = true;
    // light.shadow.bias = -0.001;
    // light.shadow.mapSize.width = 4096;
    // light.shadow.mapSize.height = 4096;
    // light.shadow.camera.near = 0.1;
    // light.shadow.camera.far = 500.0;
    // light.shadow.camera.left = 500;
    // light.shadow.camera.right = -500;
    // light.shadow.camera.top = 500;
    // light.shadow.camera.bottom = -500;
    this._scene.add(light);

    this._sun = light;

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1000, 1000, 10, 10),
      // new THREE.MeshBasicMaterial({
      //   color: 0x1e601c,

      //   // opacity: 0.5,
      //   // transparent: true,
      // })
      new THREE.ShadowMaterial({
        color: 0x000000,
        opacity: 0.2,
      })
    );
    plane.castShadow = false;
    plane.receiveShadow = true;
    plane.rotation.x = -Math.PI / 2;
    this._scene.add(plane);

    this._entityManager = new entity_manager.EntityManager();
    this._grid = new spatial_hash_grid.SpatialHashGrid(
      [
        [-1000, -1000],
        [1000, 1000],
      ],
      [100, 100]
    );

    this._LoadControllers();
    this._LoadPlayer();
    this._LoadFoliage();
    this._LoadClouds();
    this._LoadSky();

    // const interaction = new Interaction(
    //   this._threejs,
    //   this._scene,
    //   this._camera
    // );

    this._previousRAF = null;
    this._RAF();
  }

  _LoadControllers() {
    const ui = new entity.Entity();
    ui.AddComponent(new ui_controller.UIController());
    this._entityManager.Add(ui, "ui");
  }

  _LoadSky() {
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xfffffff, 0.6);
    hemiLight.color.setHSL(0.6, 1, 0.6);
    hemiLight.groundColor.setHSL(0.095, 1, 0.75);
    this._scene.add(hemiLight);

    const uniforms = {
      topColor: { value: new THREE.Color(0x0077ff) },
      bottomColor: { value: new THREE.Color(0xffffff) },
      offset: { value: 33 },
      exponent: { value: 0.6 },
    };
    uniforms["topColor"].value.copy(hemiLight.color);

    this._scene.fog.color.copy(uniforms["bottomColor"].value);

    const skyGeo = new THREE.SphereBufferGeometry(1000, 32, 15);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: _VS,
      fragmentShader: _FS,
      side: THREE.BackSide,
    });

    const sky = new THREE.Mesh(skyGeo, skyMat);
    this._scene.add(sky);
  }

  _LoadClouds() {
    for (let i = 0; i < 20; ++i) {
      const index = math.rand_int(1, 3);
      const pos = new THREE.Vector3(
        (Math.random() * 2.0 - 1.0) * 500,
        100,
        (Math.random() * 2.0 - 1.0) * 500
      );

      const e = new entity.Entity();
      e.AddComponent(
        new gltf_component.StaticModelComponent({
          scene: this._scene,
          resourcePath: "./resources/nature2/GLTF/",
          resourceName: "Cloud" + index + ".glb",
          position: pos,
          scale: Math.random() * 5 + 10,
          emissive: new THREE.Color(0x808080),
        })
      );
      e.SetPosition(pos);
      this._entityManager.Add(e);
      e.SetActive(false);
    }
  }

  _LoadFoliage() {
    for (let decorate of decorations) {
      const pos = new THREE.Vector3(
        decorate.position.x,
        decorate.position.y,
        decorate.position.z
      );

      const e = new entity.Entity();
      e.AddComponent(
        new gltf_component.StaticModelComponent({
          scene: this._scene,
          resourcePath: "./resources/showroom/",
          resourceName: decorate.name,
          scale: decorate.scale,
          emissive: new THREE.Color(0x000000),
          specular: new THREE.Color(0x000000),
          receiveShadow: true,
          castShadow: true,
          boxSelect: true,
          decorate,
        })
      );
      e.AddComponent(
        new spatial_grid_controller.SpatialGridController({ grid: this._grid })
      );
      e.SetPosition(pos);
      this._entityManager.Add(e);
      e.SetActive(false);
    }
  }

  _LoadPlayer() {
    const params = {
      camera: this._camera,
      scene: this._scene,
    };

    const levelUpSpawner = new entity.Entity();
    levelUpSpawner.AddComponent(
      new level_up_component.LevelUpComponentSpawner({
        camera: this._camera,
        scene: this._scene,
      })
    );
    this._entityManager.Add(levelUpSpawner, "level-up-spawner");

    const player = new entity.Entity();
    player.AddComponent(new player_input.BasicCharacterControllerInput(params));
    player.AddComponent(new player_entity.BasicCharacterController(params));
    player.AddComponent(
      new spatial_grid_controller.SpatialGridController({ grid: this._grid })
    );
    player.AddComponent(
      new attack_controller.AttackController({ timing: 0.7 })
    );
    this._entityManager.Add(player, "player");

    const camera = new entity.Entity();
    camera.AddComponent(
      new third_person_camera.ThirdPersonCamera({
        camera: this._camera,
        target: this._entityManager.Get("player"),
      })
    );
    this._entityManager.Add(camera, "player-camera");
  }

  _OnWindowResize() {
    this._camera.aspect = window.innerWidth / window.innerHeight;
    this._camera.updateProjectionMatrix();
    this._threejs.setSize(window.innerWidth, window.innerHeight);
  }

  _UpdateSun() {
    const player = this._entityManager.Get("player");
    const pos = player._position;

    this._sun.position.copy(pos);
    this._sun.position.add(new THREE.Vector3(-10, 500, -10));
    this._sun.target.position.copy(pos);
    this._sun.updateMatrixWorld();
    this._sun.target.updateMatrixWorld();
  }

  _OnPointerDown(event) {
    // event.preventDefault();
    this._raycaster.setFromCamera(this._mouse, this._camera);

    const intersects = this._raycaster.intersectObjects(
      this._scene.children,
      false
    );

    if (intersects.length > 0) {
      let object = intersects[0].object;
      if (object.geometry.type == "BoxGeometry") {
        const modal = document.getElementById("modal-visit");
        const content = modal.getElementsByClassName("modal-content")[0];
        const model_viewer = modal.getElementsByTagName("model-viewer")[0];
        model_viewer.src = object.decorate.path + object.decorate.name;
        content.innerHTML = object.decorate.content;
        modal.style.visibility = "visible";
      }
    }
  }

  _MouseSelector() {
    this._raycaster.setFromCamera(this._mouse, this._camera);

    const intersects = this._raycaster.intersectObjects(
      this._scene.children,
      false
    );

    if (intersects.length > 0) {
      let object = intersects[0].object;

      if (this.INTERSECTED != object) {
        //&& object.geometry.type == "BoxGeometry"
        if (this.INTERSECTED)
          this.INTERSECTED.material.emissive?.setHex(
            this.INTERSECTED.currentHex
          );
        this.INTERSECTED = object;
        this.INTERSECTED.currentHex =
          this.INTERSECTED.material.emissive?.getHex();
        this.INTERSECTED.material.emissive?.setHex(0xff0000);
      }
    } else {
      if (this.INTERSECTED)
        this.INTERSECTED.material.emissive?.setHex(this.INTERSECTED.currentHex);
      this.INTERSECTED = null;
    }
  }

  _RAF() {
    requestAnimationFrame((t) => {
      if (this._previousRAF === null) {
        this._previousRAF = t;
      }
      this._MouseSelector();

      this._RAF();

      this._threejs.render(this._scene, this._camera);
      this._Step(t - this._previousRAF);
      this._previousRAF = t;
    });
  }

  _Step(timeElapsed) {
    const timeElapsedS = Math.min(1.0 / 30.0, timeElapsed * 0.001);

    this._UpdateSun();

    this._entityManager.Update(timeElapsedS);
  }
}

let _APP = null;

window.addEventListener("DOMContentLoaded", () => {
  _APP = new HackNSlashDemo();
});
