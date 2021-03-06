<script>
	import LZS from 'lz-string';
	import store from 'store2';
	import streamSaver from 'streamsaver';
	
	import ParamsBuilder from './components/paramsBuilder.svelte';
	import Timeline from './components/timeline_editor/timeline.svelte';
	import LocalStorageFS from './components/LocalStorageFS.svelte';
	import Modal from './atoms/modal.svelte';

	import {
		default as winProps, 
		isDisabled
	} from './util/windowProperties.js';
	import hitboxProps from './util/hitboxProperties.js';
	import atkDataProps from './util/atkDataProperties.js';
	import charProps from './util/characterProperties.js';
	import { velocityAtFrame, velocityAtFrameGrav } from './util/XAtFrames.js';
	import { strip, populate } from './util/importExportData.js';
	import exporter from './util/exportToGML.js';
	import randColor from './util/randColor';

	// makes a confirmation dialog appear before closing the window
	window.onbeforeunload = (e) => 'derp';


	let modalVisible = true;

	let spritesheetSrc = {
		file: '...',
		dataUrl: '',
		dimensions: {
			width: 0,
			height: 0
		},
		framecount: 1
	};

	let char = charProps;
	let windows = [
		{
			meta: {
				name: 'new window',
				color: randColor()
			},
			data: JSON.parse(JSON.stringify({...winProps}))
		},
	];
	let hitboxes = [
		// {
		// 	meta: {
		// 		color: ...
		// 		name: ...
		//		etc: ...
		// 	},
		//  data: {HG_Attrs...}
		// }
	]
	let intermediateHitboxPos = [0, 0];
	let atkData = JSON.parse(JSON.stringify(atkDataProps));

	let editingMode = 'window';
	let mainViewInfo = true;
	let activeEl;
	let tools = [
		["pan_tool", "pan", "v"], 
		["add_box", "rectangle", "b"], 
		["rounded_corner", "round", "r"], 
		["add_circle", "circle", "o"],
		["clear", "eraser", "Backspace"]
	];
	tools.selected = "pan";

	let renderer;
	let rend;
	$: rend = (renderer) ? renderer : {};

	let anim = {
		// controlled
		animFrame: 0,
		playSpeed: 1, 
		playing: false,
		loop: true,
		zoom: 1,
		cameraX: 0,
		cameraY: 0,
		movement: true,

		grid: -1,
		gridViewerRadius: 45,
		zoomGrids: {
			0.25: [50, 50],
			0.50: [25, 25],
			1.00: [20, 20],
			2.00: [10, 10],
			4.00: [5, 5],
			8.00: [1, 1],
		},

		audio: true,

		// calculated
		duration: 0,
		spriteFrame: 0,
		windowIndex: 0, // also known as "windex" :^)
		windowFrame: 0,
		windowPositions: [],

		hitboxFrames: {},
		
		xpos: 0,
		ypos: 0,
		charFramePositionData: [],
	}

	let calc = {
		frameWidth: 0,
		sprXPos: 0,
		sprYPos: 0,
		mouseX: 0,
		mouseY: 0,
		relMouseX: 0,
		relMouseY: 0,
		aspectRatio: 1
	}

	let updateStates = {
		length: true,
		movement: true,
		hitboxes: true,
		frames: true,
	}

	// calculation of window positions also happens here
	$: if (updateStates.length) {
		updateStates.length = false;
		let temp = anim.duration;
		anim.duration = windows.reduce((acc, win, i) => {
			// gets position of window in frames
			if (anim.windowPositions.length !== i) anim.windowPositions[i] = acc;
			else anim.windowPositions.push(acc);

			// actually calculates the duration		
			return acc + (win.data.AG_WINDOW_LENGTH.value || 1)
		} , 0);
		if (temp !== anim.duration) updateStates.movement = true;
	}
	
	// movement calculations
	$: if (anim.movement && updateStates.movement) {
		updateStates.movement = false;
		let prevData = {xvel: 0, yvel: 0, xpos: 0, ypos: 0};
		for (const [windex, win] of windows.entries()) {
			let data = win.data;

			// gets velocities and positions of the character sprite		
			let HSpeed = data.AG_WINDOW_HSPEED.value || 0;
			let HFriction = (data.AG_WINDOW_HAS_CUSTOM_FRICTION.value === 1) ?
				data.AG_WINDOW_CUSTOM_GROUND_FRICTION.value : char.ground_friction.value;
			let HFrictionAir = (data.AG_WINDOW_HAS_CUSTOM_FRICTION.value === 1) ?
				data.AG_WINDOW_CUSTOM_AIR_FRICTION.value : char.air_friction.value;
				HFriction *= -1;
				HFrictionAir *= -1;

			let VSpeed = data.AG_WINDOW_VSPEED.value || 0;
			let Gravity = (atkData.AG_USES_CUSTOM_GRAVITY.value === 1 && data.AG_WINDOW_CUSTOM_GRAVITY.value !== 0) ?
				data.AG_WINDOW_CUSTOM_GRAVITY.value : char.gravity_speed.value;

			let duration = data.AG_WINDOW_LENGTH.value || 1;
			let movementData = new Array(duration).fill(0).map(() => {return {xvel: 0, yvel: 0, xpos: 0, ypos: 0}});

			// calculate vertical movement
			switch(data.AG_WINDOW_VSPEED_TYPE.value) {
				case 0:
					for (let i = 0; i < duration; i++) {
						movementData[i].yvel = velocityAtFrameGrav(Gravity, VSpeed + prevData.yvel, i);
						movementData[i].ypos = (i === 0) ? 
							prevData.ypos + movementData[i].yvel : 
							movementData[i-1].ypos + movementData[i].yvel;
						if (movementData[i].ypos > 0) {
							movementData[i].ypos = 0;
							movementData[i].yvel = 0;
						}
					}
					break;
				case 1:
					for (let i = 0; i < duration; i++) {
						movementData[i].yvel = VSpeed;
						movementData[i].ypos = (i === 0) ? 
							prevData.ypos + movementData[i].yvel : 
							movementData[i-1].ypos + movementData[i].yvel;
						if (movementData[i].ypos > 0) {
							movementData[i].ypos = 0;
							movementData[i].yvel = 0;
						}
					}
					break;
				case 2: 
					for (let i = 0; i < duration; i++) {
						movementData[i].yvel = velocityAtFrameGrav(Gravity, VSpeed, i);
						movementData[i].ypos = (i === 0) ? 
							prevData.ypos + movementData[i].yvel : 
							movementData[i-1].ypos + movementData[i].yvel;
						if (movementData[i].ypos > 0) {
							movementData[i].ypos = 0;
							movementData[i].yvel = 0;
						}
					}
					break;
			}

			// calculate horizontal movement
			switch(data.AG_WINDOW_HSPEED_TYPE.value) {
				case 0:
					for (let i = 0; i < duration; i++) {
						let ref = (i === 0) ? prevData : movementData[i-1];
						let fric = (ref.ypos === 0) ? HFriction : HFrictionAir;
						movementData[i].xvel = (ref.xvel + fric <= 0) ? 0 : ref.xvel + fric;
						if (i === 0) movementData[i].xvel += HSpeed;
						movementData[i].xpos = ref.xpos + movementData[i].xvel
					}
					break;
				case 1:
					for (let i = 0; i < duration; i++) {
						let ref = (i === 0) ? prevData : movementData[i-1];
						movementData[i].xvel = HSpeed;
						movementData[i].xpos = ref.xpos + movementData[i].xvel
					}
					break;
				case 2: 
					for (let i = 0; i < duration; i++) {
						let ref = (i === 0) ? prevData : movementData[i-1];
						let fric = (ref.ypos === 0) ? HFriction : HFrictionAir;
						movementData[i].xvel = (ref.xvel + fric <= 0) ? 0 : ref.xvel + fric;
						if (i === 0) movementData[i].xvel = HSpeed;
						movementData[i].xpos = ref.xpos + movementData[i].xvel
					}
					break;
			}

			// update animation data
			if (windex === anim.charFramePositionData.length) anim.charFramePositionData.push(movementData);
			else anim.charFramePositionData[windex] = movementData;

			// set previous window
			prevData = movementData[movementData.length - 1];
		}
	}

	// hitbox calculations
	$: if (updateStates.hitboxes) {
		updateStates.hitboxes = false;
		anim.hitboxFrames = {};
		for (const [index, hb] of hitboxes.entries()) {
			const frame = anim.windowPositions[hb.data.HG_WINDOW.value] + hb.data.HG_WINDOW_CREATION_FRAME.value;
			const duration = hb.data.HG_LIFETIME.value;
			for (let i = frame; i < frame + duration; i++) {
				if (!anim.hitboxFrames[i]) anim.hitboxFrames[i] = [];
				anim.hitboxFrames[i].push(index);
			}
		}
	}

	// things that do need to be calculated each frame
	$: if (updateStates.frames) {
		updateStates.frames = false;
		if (anim.animFrame >= anim.duration) anim.animFrame = anim.windowPositions[anim.windowIndex];
		let tracker = anim.animFrame;
		for (const [i, win] of windows.entries()) {
			tracker -= win.data.AG_WINDOW_LENGTH.value;
			if (tracker <= 0) {
				if (tracker === 0 && anim.duration !== 1) {
					anim.windowIndex = i + 1;
					anim.windowFrame = 0;
					break;
				}
				anim.windowIndex = i;
				anim.windowFrame = win.data.AG_WINDOW_LENGTH.value - (tracker * -1);
				break;
			}
		}
		let win = windows[anim.windowIndex].data;
		anim.spriteFrame = (win.AG_WINDOW_ANIM_FRAME_START.value + Math.floor((anim.windowFrame / win.AG_WINDOW_LENGTH.value) * win.AG_WINDOW_ANIM_FRAMES.value)) % spritesheetSrc.framecount;

		if (anim.movement) {
			anim.xpos = Math.floor(anim.charFramePositionData[anim.windowIndex][anim.windowFrame].xpos);
			anim.ypos = Math.floor(anim.charFramePositionData[anim.windowIndex][anim.windowFrame].ypos);
		} else {
			anim.xpos = 0;
			anim.ypos = 0;
		}

		if (anim.audio) {
			const path = (win.AG_WINDOW_SFX.options.includes(win.AG_WINDOW_SFX.value)) ?
			`./sounds/${win.AG_WINDOW_SFX.value}` : '';
			if (path !== '' && win.AG_WINDOW_SFX_FRAME.value === anim.windowFrame) {
				let thing = new Audio(path);
				thing.play();
			}
		}
	}

	// common computations
	$: {
		calc.frameWidth = spritesheetSrc.dimensions.width / spritesheetSrc.framecount;
		calc.sprXPos = anim.xpos - anim.spriteFrame * calc.frameWidth + Math.floor(char.sprite_offset_x.value) - calc.frameWidth / 2;
		calc.sprYPos = anim.ypos - Math.floor(char.sprite_offset_y.value);
		if (!anim.movement) {
			calc.sprXPos += anim.xpos;
			calc.sprYPos -= anim.ypos;
		}
		if (rend instanceof HTMLElement) {
			calc.relMouseX = (calc.mouseX - rend.getBoundingClientRect().left - rend.clientWidth / 2 + anim.cameraX/2)/anim.zoom;
			calc.relMouseY = (calc.mouseY - rend.getBoundingClientRect().top - rend.clientHeight / 2 + anim.cameraY/2)/anim.zoom;
		}
	}

	const fullUpdate = () => {
		updateStates.hitboxes = true;
		updateStates.movement = true;
		updateStates.length = true;
		updateStates.frames = true;
	}

	const save = () => {
		store({
			anim,
			windows: strip(windows),
			hitboxes: strip(hitboxes),
			spritesheetSrc,
			char: strip(char),
			atkData,
		});
	}
	const load = () => {
		editingMode = "window";
		anim.windowIndex = 0;

		let data = store();
		anim = data.anim;
		windows = populate(data.windows, winProps);
		spritesheetSrc = data.spritesheetSrc;
		char = populate(data.char, charProps);
		hitboxes = populate(data.hitboxes, hitboxProps);
		atkData = data.atkData;
		fullUpdate();
	}
	const exportWIP = () => {
		const fileStream = streamSaver.createWriteStream('WIP.roab');
		const data = (LZS.compressToUint8Array(JSON.stringify({
			anim,
			windows: strip(windows),
			hitboxes: strip(hitboxes),
			spritesheetSrc,
			char: strip(char),
			atkData,
		})))

		new Response(data).body
			.pipeTo(fileStream)
	}
	const loadWIP = async (evt) => {
		editingMode = "window";
		anim.windowIndex = 0;

		const file = evt.target.files[0];
		const data = new Uint8Array(await file.arrayBuffer());
		const d = JSON.parse(LZS.decompressFromUint8Array(data));
		
		anim = d.anim;
		windows = populate(d.windows, winProps);
		hitboxes = populate(d.hitboxes, hitboxProps);
		spritesheetSrc = d.spritesheetSrc;
		char = populate(d.char, charProps);
		atkData = d.atkData;

		fullUpdate();
	}

	let initGMLCode = 'nothing exported yet';
	let loadGMLCode = 'nothing exported yet';
	let attackGMLCode = 'nothing exported yet';
	let outputBox = 'stuff will appear here when the above buttons are clicked...';
	const gmlExport = () => {
		const strings = exporter(char, atkData, windows, JSON.parse(JSON.stringify(hitboxes)));
		initGMLCode = strings.out_INIT;
		loadGMLCode = strings.out_LOAD;
		attackGMLCode = strings.out_ATK;
	};

	const skipBack = () => {
		if (anim.windowIndex !== 0) anim.animFrame = anim.windowPositions[anim.windowIndex - 1];
		else anim.animFrame = 0;
	}
	const skipAhead = () => {
		if (anim.windowIndex !== windows.length - 1) anim.animFrame = anim.windowPositions[anim.windowIndex + 1];
		else anim.animFrame = anim.windowPositions[anim.windowIndex] + windows[anim.windowIndex].data.AG_WINDOW_LENGTH.value - 1;
	}

	const processImage = async (file) => {
		spritesheetSrc.file = file;
		spritesheetSrc.buffer = await file.arrayBuffer();

		let fileReader = new FileReader();
		fileReader.onloadend = () => {
			spritesheetSrc.dataUrl = fileReader.result;
			let img = new Image();
			img.onload = function() {
				spritesheetSrc.dimensions = {width: this.width, height: this.height}

			}
			img.src = fileReader.result;
		};
		fileReader.readAsDataURL(file);
	}

	const drawGridOverlay = (pixelsX, pixelsY, radius, xpos, ypos) => {
		const yOffset = ypos - radius * 1.5;
		const xOffset = xpos - radius * 1.5;
		let out = "";
		for (let y = yOffset - (yOffset) % pixelsY; y < ypos + radius; y += pixelsY) {
			out += `
				M ${xpos - radius} ${y}
				h ${radius * 2}
			`;
		}
		for (let x = (xOffset - (xOffset) % pixelsX); x < xpos + radius; x += pixelsX) {
			out += `
				M ${x} ${ypos - radius}
				v ${radius * 2}
			`;
		}
		return out;
	}

	const keyDownHandler = (evt, isGlobal) => {
		switch(evt.key) {
			case '[':

				skipBack();
				updateStates.frames = true;
				break;
			case ',':
				if (anim.animFrame > 0) anim.animFrame --;
				updateStates.frames = true;
				break;
			case ']':
				skipAhead();
				updateStates.frames = true;
				break;
			case '.':
				if (anim.animFrame < anim.duration - 1) anim.animFrame ++;
				updateStates.frames = true;
				break;
			default: 
				for (const t of tools) {
					if (t[1] === tools.selected) continue;
					else if (t[2] === evt.key) {
						tools.selected = t[1];
						break;
					}
				}	
		}
	}
</script>

<Modal on:close={() => modalVisible = false} bind:visible={modalVisible}/>

<LocalStorageFS saveMode={false} active={false}/>
<div id="app">
	<div id="file">
		<div class="inputGroup">
			<button on:click={() => modalVisible = true}>Help / Credits</button>
			<label for="spritesheet-upload">
				<button style="pointer-events: none">upload spritesheet</button>
			</label>
			<input id="spritesheet-upload" type="file" on:change={async (evt) => {spritesheetSrc.file = evt.target.files[0]; processImage(evt.target.files[0])}}>
		</div>
		<div class="inputGroup">
			<label for="framecount">number of frames in spritesheet:</label>
			<input id="framecount" type="number" min="1" max="99" bind:value={spritesheetSrc.framecount}>
		</div>
		<div class="inputGroup">
			<button on:click={() => editingMode = 'atkData'}><i class="material-icons">edit</i><span>edit attack data</span></button>
			<button on:click={() => editingMode = 'chrData'}><i class="material-icons">person</i><span>edit character data</span></button>
		</div> 
		<div class="inputGroup">
			<button on:click={save}><i class="material-icons">save_alt</i><span>save to browser</span></button>
			<button on:click={load}><i class="material-icons">unarchive</i><span>load from browser</span></button>
			<button on:click={gmlExport}><i class="material-icons">import_export</i><span>export to GML</span></button>
		</div>
		<div class="inputGroup">
			<button on:click={() => outputBox = initGMLCode}><i class="material-icons">attachment</i><span>init.gml</span></button>
			<button on:click={() => outputBox = loadGMLCode}><i class="material-icons">attachment</i><span>load.gml</span></button>
			<button on:click={() => outputBox = attackGMLCode}><i class="material-icons">attachment</i><span>[attackname].gml</span></button>
			<textarea 
				bind:value={outputBox} 
				style="
					height: 300px;
					width: 100%;
					color: #DDD;
					font-size: 10px;
					font-family: monospace;
					background-color: black;
				"
			/>
			<button on:click={exportWIP}>
				<i class="material-icons">attachment</i><span>export WIP</span>
			</button>
			<label for="import-wip" >
				<button style="pointer-events: none">
					<i class="material-icons">attachment</i><span>import WIP</span>			
				</button>
			</label>
			<input id="import-wip" type="file" accept=".roab" on:change={loadWIP} />
		</div>		
	</div>
	<div id="frames">
		<div class="frameContainer"
			style="
				width: {spritesheetSrc.dimensions.width}px;
				height: 100%;
				background-color: black;
			">
			{#each new Array(spritesheetSrc.framecount).fill(0) as _, i}
				<div class="frame"
					style="
						height: {spritesheetSrc.dimensions.height}px;
						width: {calc.frameWidth}px;
						background-color: white;
						background-image: url('{spritesheetSrc.dataUrl}');
						background-position: -{(calc.frameWidth) * i}px 0;
						box-shadow: {(anim.spriteFrame % spritesheetSrc.framecount == i) ? 'inset 0 0 5px black' : 'none'};
						border-right: 2px solid black;
						display: inline-block;
					"
					on:click={() => {windows[anim.windowIndex].data.AG_WINDOW_ANIM_FRAME_START.value = i}}
				></div>
			{/each}
		</div>
	</div>
	{#if renderer}
		<div 
			class="timeline-cont" 
			style="width: {renderer ? renderer.clientWidth : 0}px; outline: none;"
			tabindex="0"
			on:keydown={keyDownHandler}>
			<Timeline 
				bind:anim={anim} 
				bind:windows={windows} 
				bind:hitboxes={hitboxes} 
				bind:editingMode={editingMode}
				bind:updateStates={updateStates}
				skipAhead={skipAhead} 
				skipBack={skipBack}
				winProps={winProps}
				/>
		</div>
	{/if}
	<div id="main" 
		bind:this={renderer}
		tabindex="0"
		on:keydown={keyDownHandler}
		on:wheel={(evt) => {
			evt.preventDefault();

			anim.cameraX += evt.deltaX;
			anim.cameraY += evt.deltaY;
		}}
		on:mousemove={(evt) => {
			if (renderer.dragging) {
				switch(tools.selected) {
					case "pan": 
						if (renderer.target.includes("hitbox")) {
							const [xOffs, yOffs] = intermediateHitboxPos;
							hitboxes[hitboxes.selected].data.HG_HITBOX_X.value = xOffs - Math.ceil((renderer.mouseOrigin[0] - evt.pageX)/anim.zoom);
							hitboxes[hitboxes.selected].data.HG_HITBOX_Y.value = yOffs + Math.ceil((renderer.mouseOrigin[1] - evt.pageY)/anim.zoom);
							updateStates.hitboxes = true;
						} else if (renderer.target.includes("angle-indicator")) {
							hitboxes[hitboxes.selected].data.HG_ANGLE.value = 180 - Math.atan2(renderer.mouseOrigin[1] - evt.pageY, renderer.mouseOrigin[0] - evt.pageX) * 180/Math.PI;
							updateStates.hitboxes = true;
						} else if (renderer.target.includes("resizer")) {
							hitboxes[hitboxes.selected].data.HG_WIDTH.value = 2 * Math.ceil(Math.abs((renderer.mouseOrigin[0] - evt.pageX)/anim.zoom));
							hitboxes[hitboxes.selected].data.HG_HEIGHT.value = 2 * Math.ceil(Math.abs((renderer.mouseOrigin[1] - evt.pageY)/anim.zoom));
							updateStates.hitboxes = true;
						} else {
							anim.cameraX -= evt.movementX;
							anim.cameraY -= evt.movementY;
						}
						break;
					case "circle":
						activeEl.setAttributeNS(null, 'rx', Math.ceil(Math.abs((renderer.mouseOrigin[0] - evt.pageX)/anim.zoom)));
						activeEl.setAttributeNS(null, 'ry', Math.ceil(Math.abs((renderer.mouseOrigin[1] - evt.pageY)/anim.zoom)));
						break;
					case "rectangle":
					case "round":
						activeEl.setAttributeNS(null, 'x', renderer.svgPosition[0] - Math.ceil(Math.abs((renderer.mouseOrigin[0] - evt.pageX)/anim.zoom)) );
						activeEl.setAttributeNS(null, 'y', renderer.svgPosition[1] - Math.ceil(Math.abs((renderer.mouseOrigin[1] - evt.pageY)/anim.zoom)) );
						activeEl.setAttributeNS(null, 'width', Math.ceil(Math.abs((renderer.mouseOrigin[0] - evt.pageX)/anim.zoom))*2);
						activeEl.setAttributeNS(null, 'height', Math.ceil(Math.abs((renderer.mouseOrigin[1] - evt.pageY)/anim.zoom))*2);
						if (tools.selected === "round") {
							activeEl.setAttributeNS(null, 'rx', parseInt(activeEl.getAttribute('width')) * 0.25);
							activeEl.setAttributeNS(null, 'ry', parseInt(activeEl.getAttribute('height')) * 0.25);
							
						}
						break;
				}	
			} else {
				calc.mouseX = evt.clientX; calc.mouseY = evt.clientY
			}
		}}
		on:mousedown={(evt) => {
			tools.active = true;
			renderer.dragging = true;
			renderer.target = [...evt.target.classList]
			if (renderer.target.includes('hitbox') || renderer.target.includes('angle-indicator')) {
				if (tools.selected === 'eraser') {
					editingMode = 'window';
					hitboxes.splice(evt.target.getAttributeNS(null, 'data-index'), 1);
					updateStates.hitboxes = true;
				} else {
					editingMode = 'hitbox';
					hitboxes.selected = parseInt(evt.target.getAttributeNS(null, 'data-index'));
					const hb = hitboxes[hitboxes.selected];
					const br = hb.meta.el.getBoundingClientRect();
					renderer.mouseOrigin = [br.left + (br.right - br.left)/2, br.top + (br.bottom - br.top)/2];
					intermediateHitboxPos = [
						hitboxes[hitboxes.selected].data.HG_HITBOX_X.value + (renderer.mouseOrigin[0] - evt.pageX)/anim.zoom, 
						hitboxes[hitboxes.selected].data.HG_HITBOX_Y.value - (renderer.mouseOrigin[1] - evt.pageY)/anim.zoom
					];
					updateStates.hitboxes = true;
				}

			} else {
				if (renderer.target.includes("resizer")) {
					hitboxes.selected = parseInt(evt.target.getAttributeNS(null, 'data-index'));
					updateStates.hitboxes = true;
				}
				renderer.mouseOrigin = [evt.pageX, evt.pageY];
			}
			renderer.svgPosition = [calc.relMouseX, calc.relMouseY];
		}}
		on:mouseup={(evt) => {
			tools.active = false;
			renderer.dragging = false
			switch(tools.selected) {
				case "pan":
					let hb = hitboxes[hitboxes.selected]
					if (renderer.target.includes("hitbox")) {
						hb.data.HG_HITBOX_X.value = Math.round(hb.data.HG_HITBOX_X.value);
						hb.data.HG_HITBOX_Y.value = Math.round(hb.data.HG_HITBOX_Y.value);
						updateStates.hitboxes = true;
					} else if (renderer.target.includes("angle-indicator")) {
						hb.data.HG_ANGLE.value = Math.round(hb.data.HG_ANGLE.value);
						updateStates.hitboxes = true;
					} else if (renderer.target.includes("resizer")) {
						if (hb.data.HG_WIDTH.value === 0 || hb.data.HG_HEIGHT.value === 0) {
							editingMode = 'window';
							hitboxes.splice(hitboxes.selected, 1);
							updateStates.hitboxes = true;
						}
					}
					break;
				case "circle":
				case "rectangle":
				case "round":
					let attributes = JSON.parse(JSON.stringify(hitboxProps));
					attributes.HG_WIDTH.value = 2 * Math.ceil(Math.abs((renderer.mouseOrigin[0] - evt.pageX)/anim.zoom));
					attributes.HG_HEIGHT.value = 2 * Math.ceil(Math.abs((renderer.mouseOrigin[1] - evt.pageY)/anim.zoom));
					if (attributes.HG_WIDTH.value === 0 || attributes.HG_HEIGHT.value === 0) break;

					attributes.HG_HITBOX_X.value = Math.floor(renderer.svgPosition[0]) - calc.sprXPos - calc.frameWidth * (anim.spriteFrame);
					attributes.HG_HITBOX_Y.value = Math.floor(renderer.svgPosition[1]) - calc.sprYPos;
					attributes.HG_SHAPE.value = ["circle", "rectangle", "round"].indexOf(tools.selected);
					attributes.HG_WINDOW.value = anim.windowIndex;
					attributes.HG_WINDOW_CREATION_FRAME.value = anim.windowFrame;
					hitboxes.push({meta: {color: '#f00', stroke: '#fFF8', strokeWidth: 0.5, el: null}, data: attributes});
					hitboxes.selected = hitboxes.length - 1;
					updateStates.hitboxes = true;
					editingMode = 'hitbox';
					break;
			}
		}}
	>
		<div class="option-container" style="z-index: 500; height: auto; pointer-events: none;">
			<button class="tab" on:click={() => mainViewInfo = true} active={mainViewInfo}>info</button>
			<button class="tab" on:click={() => mainViewInfo = false} active={!mainViewInfo}>tools</button>
			<div class="tool-container">
				{#if mainViewInfo}
					<div class="option-param" style="justify-self: right; display: block;">
						zoom:
						<select bind:value={anim.zoom}>
							<option value="0.25">1/4x</option>
							<option value="0.5">1/2x</option>
							<option value="1" selected>1x</option>
							<option value="2" >2x</option>
							<option value="4" >4x</option>
							<option value="8" >8x</option>
						</select>
					</div>
					<div class="option-param" style="justify-self: right; display: block;">
						grid-x: <input type="number" bind:value={anim.zoomGrids[anim.zoom][0]} min="1" max="100"/>
					</div>
					<div class="option-param" style="justify-self: right; display: block;">
						grid-y: <input type="number" bind:value={anim.zoomGrids[anim.zoom][1]} min="1" max="100"/>
					</div>
					<div class="option-param" style="justify-self: right; display: block;">
						<label>
							lock offset: 
							<input type="checkbox" bind:checked={char.position_locked.value} />
							<span class="checkmark"></span>
						</label>
						<label>
							show motion: 
							<input type="checkbox" bind:checked={anim.movement} />
							<span class="checkmark"></span>
						</label>
						<label>
							play sounds: 
							<input type="checkbox" bind:checked={anim.audio} />
							<span class="checkmark"></span>
						</label>
					</div>
					<div class="stats">
						xvel: {anim.charFramePositionData[anim.windowIndex][anim.windowFrame].xvel}<br/>
						yvel: {anim.charFramePositionData[anim.windowIndex][anim.windowFrame].yvel}<br/>
						xpos: {anim.charFramePositionData[anim.windowIndex][anim.windowFrame].xpos}<br/>
						ypos: {anim.charFramePositionData[anim.windowIndex][anim.windowFrame].ypos}<br/>
					</div>
				{:else}
					{#each tools as tool}
						<button 
							class="tool" 
							on:click={() => tools.selected = tool[1]} 
							active={tools.selected === tool[1]}>
							<i class="material-icons">{tool[0]}</i><span>{tool[1]}</span>
						</button>

					{/each}
				{/if}
			</div>
			
		</div>
		<div class="grid {tools.selected === "pan" ? "panning" : ""} {renderer && renderer.dragging ? "dragging" : ""}" 
			style="width: 100%; height: 100%; position: absolute; top:0; left: 0; display: grid; image-rendering: pixelated;">
			<svg 
				version="2.0" 
				style="width: 100%; height: 100%;" 
				viewBox="
					{(anim.cameraX - rend.clientWidth) / 2 / anim.zoom} 
					{(anim.cameraY - rend.clientHeight) / 2 / anim.zoom} 
					{rend.clientWidth / anim.zoom} 
					{rend.clientHeight / anim.zoom}"
			>
				<defs>
					<filter id="blur" x="0" y="0">
						<feGaussianBlur in="SourceGraphic" stdDeviation="5" />
					</filter>
					<clipPath id="spriteClip" clipPathUnits="objectBoundingBox">
						<rect x="{(anim.spriteFrame % spritesheetSrc.framecount) / spritesheetSrc.framecount}" y="0" width="{1 / spritesheetSrc.framecount}" height="1" />
					</clipPath>
					<mask id="mouseMask">
						<circle cx="{calc.relMouseX}" cy="{calc.relMouseY}" r="{anim.gridViewerRadius / anim.zoom}" fill="white" filter="url(#blur)"/>
					</mask>
					<marker id="head" orient="auto" markerWidth="8" markerHeight="16"
              refX="0.1" refY="2">
						<path d="M0,0 V4 L2,2 Z"/>
					</marker>
				</defs>		
				<path d="
					M {-4 * rend.clientWidth / 2} 0
					h {rend.clientWidth * 4}
				" 
					stroke-width="{2 / anim.zoom}"
					stroke="#000F"
					shape-rendering="crispEdges"
				/>
				<path d="
					M 0 {-4 * rend.clientHeight / 2}
					v {rend.clientHeight * 4}
				" 
					stroke-width="{2 / anim.zoom}"
					stroke="#000F"
					shape-rendering="crispEdges"
				/>
				<path d={(anim.grid) ? drawGridOverlay(anim.zoomGrids[anim.zoom][0], anim.zoomGrids[anim.zoom][1], anim.gridViewerRadius / anim.zoom, calc.relMouseX, calc.relMouseY) : ''}
					stroke-width="{1 / anim.zoom}"
					stroke="#0008"
					shape-rendering="crispEdges"
					mask="url(#mouseMask)"
				/>
				<rect 
					x="{calc.sprXPos + calc.frameWidth * (anim.spriteFrame)}"
					y="{calc.sprYPos}"
					width="{calc.frameWidth}"
					height="{spritesheetSrc.dimensions.height}"
					stroke="#000"
					stroke-opacity="0.5"
					stroke-width="1"
					fill="none"
				/>
				{#if char.position_locked.value || tools.selected !== "pan"}
					<image 
						x="{calc.sprXPos}"
						y="{calc.sprYPos}"
						width="{spritesheetSrc.dimensions.width}"
						height="{spritesheetSrc.dimensions.height}"
						xlink:href="{spritesheetSrc.dataUrl}"
						clip-path="url(#spriteClip)"
					/>
				{:else}
					<image 
						on:mousedown|stopPropagation={(evt) => evt.target.dragging = true}
						on:mouseout|stopPropagation={(evt) => evt.target.dragging = false}
						on:mouseup|stopPropagation={(evt) => {
							evt.target.dragging = false;
							char.sprite_offset_x.value = Math.floor(char.sprite_offset_x.value)
							char.sprite_offset_y.value = Math.floor(char.sprite_offset_y.value)
						}}
						
						on:mousemove|stopPropagation={(evt) => {
							if (evt.target.dragging && !char.position_locked.value && tools.selected === "pan") {
								char.sprite_offset_x.value += evt.movementX / anim.zoom / 2;
								char.sprite_offset_y.value -= evt.movementY / anim.zoom / 2;
							}
						}}
						x="{calc.sprXPos}"
						y="{calc.sprYPos}"
						width="{spritesheetSrc.dimensions.width}"
						height="{spritesheetSrc.dimensions.height}"
						xlink:href="{spritesheetSrc.dataUrl}"
						clip-path="url(#spriteClip)"
					/>
				{/if}
				{#each hitboxes as hitbox, i}
					{#if anim.hitboxFrames[anim.animFrame] && anim.hitboxFrames[anim.animFrame].includes(i)}
						{#if hitbox.data.HG_SHAPE.value === 0}
							<ellipse 
								class="hitbox {hitboxes.selected === i ? "active" : ""}"
								data-index={i}
								bind:this={hitbox.meta.el}
								cx="{calc.sprXPos + calc.frameWidth/2 + hitbox.data.HG_HITBOX_X.value + calc.frameWidth * (anim.spriteFrame)}" 
								cy="{calc.sprYPos + spritesheetSrc.dimensions.height/2 - hitbox.data.HG_HITBOX_Y.value}"
								rx="{hitbox.data.HG_WIDTH.value / 2}"
								ry="{hitbox.data.HG_HEIGHT.value / 2}"
								fill="{hitbox.meta.color}"
								stroke="{(hitboxes.selected === i) ? 'black' : hitbox.meta.stroke || 'black'}"
								stroke-width="{(hitboxes.selected === i) ? 4/anim.zoom : hitbox.meta.strokeWidth || 0}"
							/>
						{:else if hitbox.data.HG_SHAPE.value === 1}
							<rect 
								class="hitbox {hitboxes.selected === i ? "active" : ""}"
								data-index={i}
								bind:this={hitbox.meta.el}
								x="{calc.sprXPos + calc.frameWidth/2 + hitbox.data.HG_HITBOX_X.value - hitbox.data.HG_WIDTH.value / 2 + calc.frameWidth * (anim.spriteFrame)}" 
								y="{calc.sprYPos + spritesheetSrc.dimensions.height/2 - hitbox.data.HG_HITBOX_Y.value - hitbox.data.HG_HEIGHT.value / 2}"
								width="{hitbox.data.HG_WIDTH.value}"
								height="{hitbox.data.HG_HEIGHT.value}"
								fill="{hitbox.meta.color}"
								stroke="{(hitboxes.selected === i) ? 'black' : hitbox.meta.stroke || 'black'}"
								stroke-width="{(hitboxes.selected === i) ? 4/anim.zoom : hitbox.meta.strokeWidth || 0}"
							/>
						{:else}
							<rect 
								class="hitbox {hitboxes.selected === i ? "active" : ""}"
								data-index={i}
								bind:this={hitbox.meta.el}
								x="{calc.sprXPos + calc.frameWidth/2 + hitbox.data.HG_HITBOX_X.value - hitbox.data.HG_WIDTH.value / 2 + calc.frameWidth * (anim.spriteFrame)}" 
								y="{calc.sprYPos + spritesheetSrc.dimensions.height/2 - hitbox.data.HG_HITBOX_Y.value - hitbox.data.HG_HEIGHT.value / 2}"
								rx="{hitbox.data.HG_WIDTH.value * 0.25}"
								ry="{hitbox.data.HG_HEIGHT.value * 0.25}"
								width="{hitbox.data.HG_WIDTH.value}"
								height="{hitbox.data.HG_HEIGHT.value}"
								fill="{hitbox.meta.color}"
								stroke="{(hitboxes.selected === i) ? 'black' : hitbox.meta.stroke || 'black'}"
								stroke-width="{(hitboxes.selected === i) ? 4/anim.zoom : hitbox.meta.strokeWidth || 0}"
							/>
						{/if}
						<line 
							class="angle-indicator"
							data-index={i}
							x1="{calc.sprXPos + calc.frameWidth/2 + hitbox.data.HG_HITBOX_X.value + calc.frameWidth * (anim.spriteFrame)}"
							x2="{
								calc.sprXPos 
								+ hitbox.data.HG_HITBOX_X.value 
								+ calc.frameWidth/2
								+ Math.cos(hitbox.data.HG_ANGLE.value * -Math.PI/180) 
								* hitbox.data.HG_BASE_KNOCKBACK.value * 5/anim.zoom
								+ calc.frameWidth * (anim.spriteFrame)}"
							y1="{calc.sprYPos + spritesheetSrc.dimensions.height/2 - hitbox.data.HG_HITBOX_Y.value}"
							y2="{
								calc.sprYPos 
								+ spritesheetSrc.dimensions.height/2
								- hitbox.data.HG_HITBOX_Y.value 
								+ Math.sin(hitbox.data.HG_ANGLE.value * -Math.PI/180) 
								* hitbox.data.HG_BASE_KNOCKBACK.value * 5/anim.zoom}"
							stroke="#000" stroke-opacity="0.5" stroke-width="{4/anim.zoom}" stroke-dasharray="{(hitbox.data.HG_ANGLE.value === 361) ? 4/anim.zoom : 0}"
							marker-end="url(#head)"
						/>
						{#if tools.selected === 'pan'}
							<circle 
								class="resizer"
								data-index={i}
								cx="{calc.sprXPos + calc.frameWidth/2 + hitbox.data.HG_HITBOX_X.value + calc.frameWidth * (anim.spriteFrame)}" 
								cy="{calc.sprYPos + spritesheetSrc.dimensions.height/2 - hitbox.data.HG_HITBOX_Y.value}"
								r="{4/anim.zoom}"
							/>
						{/if}
					{/if}
				{/each}
				{#if tools.active}
					{#if tools.selected === 'circle'}
						<ellipse 
							class="hitbox"
							cx="{Math.floor(calc.relMouseX)}"
							cy="{Math.floor(calc.relMouseY)}"
							bind:this={activeEl}
							fill="#F00"
							stroke="black"
							stroke-width="{4 / anim.zoom}"
						/>
					{:else if tools.selected === 'rectangle' || tools.selected === 'round'}
						<rect 
							class="hitbox"
							x="{Math.floor(calc.relMouseX)}" 
							y="{Math.floor(calc.relMouseY)}"
							bind:this={activeEl}
							fill="#F00"
							stroke="black"
							stroke-width="{4 / anim.zoom}"
						/>
					{/if}
				{:else if ['circle', 'rectangle', 'round'].includes(tools.selected)}
					<ellipse 
						class="hitbox"
						style="pointer-events: none"
						cx="{Math.floor(calc.relMouseX)}"
						cy="{Math.floor(calc.relMouseY)}"
						rx="1"
						ry="1"
						fill="#F00"
						stroke="black"
						stroke-width="0"
					/>
					
				{/if}
			</svg>
		</div>
	</div>
	<div id="settings">
		{#if editingMode === 'window'}
			<ParamsBuilder 
				isDisabled={isDisabled} 
				bind:props={windows[anim.windowIndex].data} 
				on:dataChanged={() => {updateStates.length = true; updateStates.movement = true; updateStates.frames = true;}}
			/>
		{:else if editingMode === 'hitbox'}
			<ParamsBuilder 
				isDisabled={isDisabled} 
				bind:props={hitboxes[hitboxes.selected].data} 
				on:dataChanged={() => updateStates.hitboxes = true}
			/>
		{:else if editingMode === 'atkData'}
			<ParamsBuilder 
				isDisabled={isDisabled} 
				bind:props={atkData} 
				on:dataChanged={() => updateStates.movement = true} 
			/>
		{:else if editingMode === 'chrData'}
			<ParamsBuilder 
				isDisabled={isDisabled} 
				bind:props={char} 
				on:dataChanged={() => updateStates.movement = true} 
			/>
		{/if}
	</div>
</div>

<style>
	#app {
		height: 100vh;
		width: 100vw;
		display: grid;

		grid-template-columns: 300px auto 300px;
		grid-template-rows: 100px 30px 55px 30px auto;
	}

	#file,
	#settings {
		padding: 5px;
	}

	#frames {
		background-color: #000;
		grid-row: 1 / 2;
		grid-column: 2 / 3;
		overflow-x: scroll;
	}

	#file {
		background-color: #555;
		border: 5px double #222;
		color: white;
		grid-row: 1 / 6;
		grid-column: 1 / 2;
		border-right: 1px solid #333;
	}

	#main {
		background-color: #888;
		grid-row: 5 / 6;
		grid-column: 2 / 3;
		position: relative;
		border-top: 1px solid #555;

		display: grid;
		overflow: hidden;
		outline: none;
	}

	#settings {
		background-color: #555;
		border: 5px double #222;
		color: white;
		grid-row: 1 / 6;
		grid-column: 3 / 4;
		border-left: 1px solid #333;
		overflow-y: scroll;
		user-select: none;
	}

	.inputGroup { 
		width: 100%;
		height: auto;
		padding: 10px;
	}

	input[type="file"] {
		display: none;
	}
	
	.filename {
		margin: 0;
	}

	.option-container { 
		position: absolute; 
		background-color: #FFF8;
		border-bottom-right-radius: 2px;
		user-select: none;
		display: grid;
		grid-template-rows: 25px auto;
		grid-template-columns: auto auto;
		width: 150px;
	}
	.tab { pointer-events: auto; border: none; border-radius: 0; }
	.tab[active="true"] { background-color: transparent; }
	.tab[active="false"] { background-color: #0004; }
	.tool-container {grid-column: 1 / 3; padding: 10px;}
	.option-param, .stats { pointer-events: auto; width: auto;}

	button.tool {
		height: 30px;
		width: 100%;
		pointer-events: auto;
	}
	button.tool[active="true"] {
		background-color: transparent;
		border: none;
	}
	button.tool span {
		float: left;
		padding-left: 10px;
		vertical-align: middle;
		text-align: center;
	}
	button.tool i {
		font-size: 20px;
		float: left;
		vertical-align: middle;
	}

	.inputGroup button {
		height: 30px;
		width: 70%;
	}
	.inputGroup button i {
		float: left;
		vertical-align: middle;
	}
	.inputGroup button span {
		float: right;
		vertical-align: middle;
	}

	input[type="checkbox"] {
		width: 0;
		height: 0;
		opacity: 0;
		position: absolute;
	}
	input[type="checkbox"] ~ .checkmark {
		display: inline-block;
		margin-bottom: -5px;
		width: 20px;
		height: 20px;
		border: 2px solid var(--accent);
		border-radius: 2px;
	}

	input[type="checkbox"]:checked ~ .checkmark {
		display: inline-block;
		margin-bottom: -5px;
		width: 20px;
		height: 20px;
		border: 2px solid var(--accent);
		background-color: var(--accent);
		border-radius: 2px;
	}

	input[type="checkbox"] ~ .checkmark::after {
		display: block;
		opacity: 0;
		margin-left: 4px;
		width: 5px;
		height: 10px;
		border-bottom: 3px solid white;
		border-right: 3px solid white;
		border-radius: 2px;
		transform: rotate(45deg);
		content: "";
	}
	input[type="checkbox"]:checked ~ .checkmark::after {
		opacity: 1;
	}
	.hitbox:not(.active) {
		fill-opacity: 0.5;
		stroke-width: 0;
	}
	.hitbox.active {
		fill-opacity: 0.7;
	}
	.panning .hitbox:not(.active):hover {
		fill-opacity: 1;
		stroke: black;
		stroke-dasharray: 4;
		stroke-width: 2;
	}
	.panning:not(.dragging) .hitbox.active:hover {
		fill-opacity: 1;
	}
	.dragging .hitbox {
		fill-opacity: 0.35;
		stroke-opacity: 0.35;
	}
	.resizer:hover {
		stroke: black;
		stroke-width: 5;
	}
	.angle-indicator:hover {
		stroke: black;
		stroke-opacity: 1;
	}
	
</style>