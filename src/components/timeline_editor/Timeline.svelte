<div class="container"
  style="width: 100%"
  bind:this={fullContainer}
>
  <div class="toolbar">
    <div class="left-align">
      <span class="frame">{`${anim.animFrame + 1}`.padStart(anim.duration.toString().length, ' ')} / {anim.duration}</span>
      <svg on:click={() => audio = !audio}><path d={audio ? mdiVolumeHigh : mdiVolumeMute}/></svg>
    </div>
    <div class="center-align">
      <svg on:click={skipBack}><path d={mdiSkipPrevious}/></svg>
      <svg on:click={togglePlay}><path d={anim.playing ? mdiPause : mdiPlay}/></svg>
      <svg on:click={skipAhead}><path d={mdiSkipNext}/></svg>
    </div>
    <div class="right-align">
      <svg on:click={() => anim.playSpeed = (anim.playSpeed === 0.25) ? 0.5 : 1}><path d={mdiMenuUp}/></svg>
      <span class="play-speed">{`x${anim.playSpeed}`.padStart(5, ' ')}</span>
      <svg on:click={() => anim.playSpeed = (anim.playSpeed === 1) ? 0.5 : 0.25}><path d={mdiMenuDown}/></svg>
    </div>
  </div>
  <div class="timeline-container" bind:this={timelineContainer}>
    <div class="timeline"
      style="width: { anim.duration !== 0 ? `${timelineScale * anim.duration}px` : `100%`};"
    >
      {#each windows as win, i}
        <div
          class="window"
          on:click={() => {anim.animFrame = anim.windowPositions[i]; updateStates.frames = true; editingMode = "window"}}
          on:wheel={handleZoom}
          tabindex="0"
          style="flex-grow: {win.data.AG_WINDOW_LENGTH.value};
            background-color: {win.meta.color};
            {anim.windowIndex === i ? 'box-shadow: inset 0 0 0 2px black, inset 0 0 0 3px white' : ''}"
        >
          <span
            class="window-name"
          >{win.meta.name}</span>
          {#if anim.windowIndex === i}
            <div class="window-controls">
              <svg viewBox="0 0 24 24" on:click|stopPropagation={addWindowLeft}><path d={mdiPlus}/></svg>
              <svg 
                viewBox="0 0 24 24" 
                style="pointer-events: {windows.length === 1 ? 'none' : 'auto'};
                  fill: {windows.length === 1 ? '#888' : '#fff'}"
                on:click|stopPropagation={handleWindowDeletion}><path d={mdiDelete}/></svg>
              <svg viewBox="0 0 24 24" on:click|stopPropagation={addWindowRight}><path d={mdiPlus}/></svg>
              <!-- <svg viewBox="0 0 24 24" on:click|stopPropagation={editWindowName}><path d={mdiPencil}></path></svg>
              <svg viewBox="0 0 24 24"><path d={mdiPalette}></path></svg> -->
            </div>
          {/if}
        </div>
      {/each}
      {#if windows.length === 0}
        <div
          class="window"
          style="flex-grow: 1;
            height: calc(100% - 8px);
            background-color: #000"
        >
          <span
            class="window-name"
            style="color: #fff"
          >no parts created</span>
          <!-- <div class="window-controls">
            <svg viewBox="0 0 24 24" on:click|stopPropagation={addWindowRight}><path d={mdiPlus}/></svg>
          </div> -->
        </div>
      {/if}
    </div>

    <div
      class="frame-indicators"
      style="width: {timelineScale * anim.duration}px;"
    >
      {#each new Array(anim.duration).fill(0) as _, i}
        <div class="indicator {i === anim.animFrame ? 'cur' : ''} {isFrameWithinWindow(i, anim.windowIndex) ? 'currWindow' : ''}" on:wheel={handleZoom}>
          <div class="selector"
            style="{i === anim.animFrame ? 'background-color: #D00;' : ''}"
            on:click={() => {anim.animFrame = i; updateStates.frames = true; editingMode = "window"} }
          ></div>
          {#if i !== anim.duration}
            <div class="bar bar-l"></div>
            <div class="bar bar-r"></div>
          {/if}
          <div class="current"
            style="{i === anim.animFrame ? 'background-color: #AAA;' : ''}"
            on:click={() => {anim.animFrame = i; updateStates.frames = true; editingMode = "window"} }
          ></div>
        </div>
      {/each}
    </div>
  </div>
  <div class="toolbar bottom">
    <div class="left-align">
      <label style="display: inline-block">
				name:
				{#if editingMode === 'window'}
					<input type="text" bind:value={windows[anim.windowIndex].meta.name}>
				{:else if editingMode === 'hitbox'}
					<input type="text" bind:value={hitboxes[hitboxes.selected].meta.name}>
				{/if}
			</label>
			<label style="display: inline-block">
				color:
				{#if editingMode === 'window'}
					<input type="text" bind:value={windows[anim.windowIndex].meta.color}>
				{:else if editingMode === 'hitbox'}
					<input type="text" bind:value={hitboxes[hitboxes.selected].meta.color}>
				{/if}
			</label>
    </div>
  </div>
</div>

<script>
  import { onMount, onDestroy } from 'svelte';

  import {
    mdiVolumeHigh,
    mdiVolumeMute,
    mdiSkipPrevious,
    mdiSkipNext,
    mdiPlay,
    mdiPause,
    mdiMenuDown,
    mdiMenuUp,
    mdiPlus,
    mdiDelete,
    mdiPencil,
    mdiPalette
  } from '@mdi/js'

  import randColor from '../../util/randColor.js';

  export let anim;
  export let windows;
  export let hitboxes;
  export let skipAhead;
  export let skipBack;
  export let editingMode;
  export let winProps;
  export let updateStates;

  export let timelineWidth = 100;

  // let currentFrame = anim.animFrame;
  // let frameCount = anim.duration;
  // let anim.windowIndex = anim.windowIndex;
  // let playSpeed = anim.playSpeed;
  
  let fpsMonitor = 0;

  const isFrameWithinWindow = (frame, window) => {
    if (anim.windowPositions.length === window + 1) {
      return anim.windowPositions[window] <= frame;
    } else {
      return anim.windowPositions[window] <= frame && frame < anim.windowPositions[window + 1];
    }
  }

  const togglePlay = () => {
    anim.playing = !anim.playing;
		if (anim.playing) play();
  }

  const play = () => {
    if (anim.playing) {
			requestAnimationFrame(play);
			updateStates.frames = true;
			fpsMonitor++;
			if (fpsMonitor >= (1 / anim.playSpeed)) {
				fpsMonitor = 0;
				if (anim.animFrame + 1 === anim.duration) {
					anim.animFrame = 0;
					if (!anim.loop) { anim.playing = false; }
				}
				else { anim.animFrame += 1}
      }
      timelineContainer.scrollLeft = (anim.animFrame - Math.floor(timelineWidth / timelineScale / 2)) * timelineScale;
		}
  }

  const handleZoom = (evt) => {
    evt.preventDefault();
    timelineScale += evt.deltaY / 100
    timelineContainer.scrollLeft += evt.deltaX;
    if (timelineScale < 8) timelineScale = 8;
    else if (timelineScale > 100) timelineScale = 100;
  }

  const addWindowLeft = () => {
    windows.splice(anim.windowIndex, 0, {meta: {
      color: randColor(),
      name: `new window`
    }, data: JSON.parse(JSON.stringify({...winProps}))} );
		anim.animFrame = anim.animFrame;
		updateStates.length = true;
    updateStates.frames = true;
  }
  const addWindowRight = () => {
    windows.splice(anim.windowIndex + 1, 0, {meta: {
      color: randColor(),
      name: `new window`
    }, data: JSON.parse(JSON.stringify({...winProps}))} );
		anim.animFrame = anim.animFrame;
		updateStates.length = true;
    updateStates.frames = true;
  }
  const handleWindowDeletion = () => {
		windows.splice(anim.windowIndex, 1);
		anim.animFrame = anim.windowPositions[anim.windowIndex - 1] || 0;
		updateStates.length = true;
		updateStates.frames = true;
	}

  let windowBoundaries = [];
  let audio = true;
  let timelineScale = 60;

  let timelineContainer;
  let fullContainer;

  const resizeTracker = () => {
    timelineWidth = fullContainer.clientWidth;
  }

  onMount(() => {
    window.addEventListener('resize', resizeTracker);
    timelineWidth = fullContainer.clientWidth;
  })

  onDestroy(() => {
    window.removeEventListener('resize', resizeTracker);
  })

</script>

<style>
  .container {
    height: 75px;
    background-color: grey;
    position: relative;
    user-select: none;
    max-width: 100%;
  }

  .toolbar {
    background-color: #000;
    color: #fff;
    width: 100%;
    height: 30px;

    display: flex;
    flex-direction: row;
  }

  .toolbar > div { flex: 1; position: relative; }
  .toolbar .left-align { display: flex; justify-content: flex-start; }
  .toolbar .center-align { display: flex; justify-content: center; }
  .toolbar .right-align { display: flex; justify-content: flex-end; }
  .toolbar svg {
    position: relative;
    display: inline-block;
    width: 24px;
    height: 24px;
    fill: #fff;
    margin-top: 3px;
  }

  svg:hover path {
    stroke: #fff;
    stroke-width: 1;
  }

  .frame,
  .play-speed,
  .window-name {
    position: relative;
    margin-top: 3px;
    padding: 0 5px;
    font-family: "Roboto Mono";
    white-space: pre;
  }

  .timeline-container {
    background-color: #fff;
    position: relative;
    width: 100%;
    height: 55px;

    overflow-x: scroll;
    overflow-y: hidden;
  }
  .timeline-container::-webkit-scrollbar {
    display: none;
  }

  .timeline {
    background-color: #fff;
    position: relative;
    height: 100%;

    display: flex;
    flex-direction: row;
  }

  .window {
    position: relative;

    text-align: left;
    margin: 8px 2px 4px 2px;
    border-radius: 5px;
    height: calc(100% - 12px);
    font-size: 18px;
    overflow: hidden;
  }
  .window-name {
    position: absolute;
    top: 0;
    bottom: 0;
    margin: auto;
  }
  .window-controls {
    position: absolute;
    margin: auto;
    bottom: 0;
    width: 100%;
    background-color: #000;
    height: 15px;
  }
  .window-controls svg {
    position: relative;
    margin-bottom: 6px;
    height: 15px;
    width: 15px;
    fill: #fff;
  }

  .frame-indicators {
    position: absolute;
    margin: auto;
    top: 0;
    height: 5px;
    width: 100%;

    display: flex;
    flex-direction: row;
    overflow: visible;
  }

  .frame-indicators .indicator { position: relative; flex: 1; height: 55px}
  .frame-indicators .indicator.cur { height: 55px; pointer-events: none }
  .frame-indicators .indicator.currWindow { height: 40px; }
  .frame-indicators .indicator .bar {
    position: absolute;
    margin: auto;
    top: 0;
    width: 1px;
    height: 5px;
    background-color: #888;
    mix-blend-mode: multiply;
  }
  .bar-r { right: 0 }
  .bar-l { left: 0 }

  .frame-indicators .indicator .selector {
    position: absolute;
    margin: auto;
    left: 0;
    right: 0;
    top: 0;
    width: 100%;
    height: 5px;
    background-color: #AAA;
    isolation: isolate;
  }

  .frame-indicators .indicator:hover .selector {
    height: 10px;
    margin-top: -2px;
    background-color: #f88;
    border-bottom: 1px solid #000;
  }

  .frame-indicators .indicator .current {
    position: absolute;
    margin: auto;
    top: 8px;
    width: 100%;
    height: calc(100% - 12px);
    mix-blend-mode: multiply;
  }

  .frame-indicators .indicator:hover .current {
    background-color: #AAA;
  }
  
  label {
    padding: 3px 10px;
  }


</style>