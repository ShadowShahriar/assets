class Camera {
	#cacheTrigger
	#activeElem
	#activePointer
	#currentValues
	#force
	#multiplier
	#rootStyles
	#eventsCache
	#diffCache

	constructor(root = '[data-camera]') {
		this.root = document.querySelector(root)
		this.#rootStyles = this.root.style
		this.defaults = {
			debug: false,
			isolation: true,
			attrDragging: 'data-dragging',
			attrAutoRotate: 'data-autorotate',

			rotate: {
				only: 'YZ',
				speed: 1,
				range: { Y: false, Z: false },
				var: ['--cameraY', '--cameraZ']
			},

			pan: {
				only: 'XYZ',
				speed: 2,
				range: { X: false, Y: false, Z: false },
				var: ['--translateX', '--translateY', '--translateZ']
			},

			zoom: {
				only: false, // pinch or wheel
				wheelSpeed: 1,
				wheelMaxSpeed: 2,
				pinchSpeed: 2,
				range: [25, 200],
				var: ['--scale']
			},

			perspective: {
				speed: 5,
				range: { perspective: [350, 10e4] },
				var: ['--perspective']
			}
		}
		this.options = this.defaults
		this.#cacheTrigger = null
		this.#currentValues = {}

		// 1366 * 768 is device's screen dimensions and
		// 6 is the ideal divider for a smoother
		// drag experience
		this.#force = (1366 * 768) / 6
		this.#multiplier = 1

		// to cache pointer events
		this.#eventsCache = []
		this.#diffCache = -1
	}

	/**
	 * thin wrapper around the `window.addEventListener`.
	 * @param {string} event
	 * @param {function} fn
	 */
	#register(event, fn) {
		return window.addEventListener(event, fn, { passive: false })
	}

	/**
	 * thin wrapper around the `window.removeEventListener`.
	 * @param {string} event
	 * @param {function} fn
	 */
	#unregister(event, fn) {
		return window.removeEventListener(event, fn, { passive: false })
	}

	/**
	 * calculate the distance between two coordinates.
	 * the end result is equivalent to
	 * `Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)`
	 * @param {number} x1
	 * @param {number} y1
	 * @param {number} x2
	 * @param {number} y2
	 */
	#distance(x1, y1, x2, y2) {
		return Math.hypot(x2 - x1, y2 - y1)
	}

	/** restrict a value to a given range.
	 * @param {number} min - the lower boundary of the output range
	 * @param {number} max - the upper boundary of the output range
	 * @param {number} preference - the preferred value that would clamped
	 */
	#clamp(min, preference, max) {
		return Math.min(Math.max(min, preference), max)
	}

	#annotate(message) {
		if (this.options.debug) {
			let color = 'skyblue'
			let symbol = message.slice(0, 1)

			switch (symbol) {
				case '-':
					color = 'orange'
					break

				case '?':
					color = 'white'
					break

				default:
					break
			}

			console.log(`%c${message}`, `color: ${color}; font-weight: bold`)
		}
	}

	#obtainCoords(e) {
		return { x: e.pageX, y: e.pageY }
	}

	#obtainCurrentValues() {
		// get all CSS properties of the root element
		let CSSData = getComputedStyle(this.root)

		// get a specific property and convert it to a number value
		let pull = property => Number(CSSData.getPropertyValue(property))

		// array of custom properties to pull
		let customProperties = []

		// "iterate through all properties in the options object"
		for (let option in this.options) {
			let vars = this.options[option].var

			// "check if the property has a var array
			// and var's length is greater than 0"
			if (vars && vars.length > 0)
				// "push all items from var array to
				// customProperties array"
				for (let item of vars) customProperties.push(item)
		}

		let object = {}
		for (let item of customProperties) object[item] = pull(item)

		//console.log(object)
		this.#currentValues = object
	}

	init() {
		if (this.options.debug) console.info(this.options)

		this.#register('pointerdown', e => this.setEvents(e))
		this.#register('pointerup', e => this.disposeEvents(e))
		this.#register('dblclick', _e => this.toggleAutoRotate())
		this.#register('wheel', e => this.wheelZoom(e))
	}

	wheelZoom(e) {
		let zoomSettings = this.options.zoom
		if (zoomSettings.only === 'pinch')
			return this.#annotate('? wheel zoom disabled')

		e.preventDefault()
		this.#obtainCurrentValues()
		let scaleSpeed = zoomSettings.wheelSpeed
		if (e.ctrlKey) scaleSpeed = zoomSettings.wheelMaxSpeed

		let zoomVar = zoomSettings.var[0]
		let zoomCurrent = this.#currentValues[zoomVar]

		zoomCurrent -= e.deltaY * 0.1 * scaleSpeed

		if (
			zoomSettings.range &&
			typeof zoomSettings.range[0] === 'number' &&
			typeof zoomSettings.range[1] === 'number'
		) {
			zoomCurrent = this.#clamp(
				zoomSettings.range[0],
				zoomCurrent,
				zoomSettings.range[1]
			)
		}

		if (this.#currentValues[zoomVar] === zoomCurrent) {
			this.#annotate('? zoom hits the range boundary')
		} else {
			if (e.deltaY < 0) this.#annotate('+ zoom in')
			else this.#annotate('- zoom out')
		}

		this.#rootStyles.setProperty(zoomVar, `${zoomCurrent}`)
	}

	#addCacheEvent(e) {
		// add the event
		this.#eventsCache.push(e)
		//console.info(this.#eventsCache)
	}

	#findCacheEvent(e) {
		// find this event in the cache and update its record with this event
		for (let i = 0, n = this.#eventsCache.length; i < n; i++)
			if (e.pointerId == this.#eventsCache[i].pointerId) {
				this.#eventsCache[i] = e
				break
			}
	}

	#removeCacheEvent(e) {
		// remove this event from the target's cache
		for (let i = 0, n = this.#eventsCache.length; i < n; i++) {
			if (this.#eventsCache[i].pointerId == e.pointerId) {
				this.#eventsCache.splice(i, 1)
				break
			}
		}

		if (this.#eventsCache.length < 2) this.#diffCache = -1
		//console.info(this.#eventsCache)
	}

	#setupZoom() {
		let f1 = this.#eventsCache[0]
		let f2 = this.#eventsCache[1]
		// let diffCurrent = this.#distance(
		// 	f1.clientX,
		// 	f1.clientY,
		// 	f2.clientX,
		// 	f2.clientY
		// )
		let diffCurrent = f1.clientY - f2.clientY
		let increment = 0

		if (diffCurrent > this.#diffCache) increment++
		else if (diffCurrent < this.#diffCache) increment--

		this.#pinchZoom(increment)

		this.#diffCache = diffCurrent
	}

	#pinchZoom(delta) {
		let zoomSettings = this.options.zoom
		if (zoomSettings.only === 'wheel')
			return this.#annotate('? pinch zoom disabled')

		this.#obtainCurrentValues()
		let zoomVar = zoomSettings.var[0]
		let zoomCurrent = this.#currentValues[zoomVar]

		let scaleSpeed = zoomSettings.pinchSpeed
		zoomCurrent += delta * scaleSpeed

		if (
			zoomSettings.range &&
			typeof zoomSettings.range[0] === 'number' &&
			typeof zoomSettings.range[1] === 'number'
		) {
			zoomCurrent = this.#clamp(
				zoomSettings.range[0],
				zoomCurrent,
				zoomSettings.range[1]
			)
		}

		if (this.#currentValues[zoomVar] === zoomCurrent) {
			this.#annotate('? zoom hits the range boundary')
		} else {
			if (delta < 0) this.#annotate('- zoom out')
			else this.#annotate('+ zoom in')
		}

		this.#rootStyles.setProperty(zoomVar, `${zoomCurrent}`)
	}

	trigger(e) {
		e.preventDefault()
		this.#findCacheEvent(e)

		if (this.#eventsCache.length >= 2) {
			this.#setupZoom()
		} else {
			const { x, y } = this.#obtainCoords(e)
			const cx = this.startPoints.x,
				cy = this.startPoints.y

			let deltaX = (cx - x) / this.#multiplier
			let deltaY = (cy - y) / this.#multiplier

			if (e.ctrlKey) {
				this.update('Y', deltaX, this.options.pan)
				this.update('X', deltaY, this.options.pan)
			} else if (e.altKey) {
				this.update('Z', deltaY, this.options.pan)
			} else if (e.shiftKey) {
				this.update(
					'perspective',
					deltaY, //displacement * direction,
					this.options.perspective
				)
			} else {
				this.update('Y', -deltaY, this.options.rotate)
				this.update('Z', -deltaX, this.options.rotate)
			}
		}
	}

	update(axis, delta, type) {
		let properties = type.var
		let variable = a => properties.find(p => p.includes(a))

		let _var = variable(axis)
		let current = this.#currentValues[_var]

		current = current - delta * type.speed

		if (
			type.range[axis] &&
			type.range[axis].length === 2 &&
			typeof type.range[axis][0] === 'number' &&
			typeof type.range[axis][1] === 'number'
		) {
			current = this.#clamp(
				type.range[axis][0],
				current,
				type.range[axis][1]
			)
		}

		if (
			type.override ||
			!type.only ||
			(typeof type.only === 'string' && type.only.includes(axis))
		)
			this.#rootStyles.setProperty(_var, `${current}`)
		else {
			this.#annotate(`? ${axis}-axis was disabled`)
		}
	}

	setEvents(e) {
		e.preventDefault()
		this.#addCacheEvent(e)
		this.#rootStyles.cursor = 'grabbing'
		this.#annotate('+ set events')

		// check if data-isolated exists in the target element
		// meaning the element is isolated
		let isIsolated = e.target.dataset['isolated'] !== undefined

		// if isolation is allowed in the options and the
		// element is isolated, break the function midway
		// and return a meaningful* console message
		if (this.options.isolation && isIsolated)
			return this.#annotate("? isolated content, gestures won't work")

		// add an attribute to the root element
		this.root.setAttribute(this.options.attrDragging, '')

		// map the force value to window's current dimensions
		this.#multiplier = Math.max(
			1,
			(window.innerWidth * window.innerHeight) / this.#force
		)

		// store the current coordinates from the event
		this.startPoints = this.#obtainCoords(e)

		// obtain the current values of the CSS custom properties
		// defined in the root element
		this.#obtainCurrentValues()

		// to ensure that the target receives pointer events
		// even when the pointer's contact moves off
		this.#activeElem = e.target
		this.#activePointer = e.pointerId
		this.#activeElem.setPointerCapture(this.#activePointer)
		this.#annotate('+ capturing')

		// bind the `trigger` method with correct execution
		// context and store the event as a property, so that
		// we can remove it later
		this.#cacheTrigger = this.trigger.bind(this)

		// add the event listener
		this.#register('pointermove', this.#cacheTrigger)
	}

	disposeEvents(e) {
		e.preventDefault()
		this.#removeCacheEvent(e)
		this.#rootStyles.cursor = 'grab'

		// remove the attribute we added previously
		// to the root element
		this.root.removeAttribute(this.options.attrDragging)

		// release the target capture
		if (this.#activeElem) {
			this.#activeElem.releasePointerCapture(this.#activePointer)
			this.#activeElem = null
			this.#annotate('- released capture')
		}

		// remove the event listener we cache earlier
		this.#unregister('pointermove', this.#cacheTrigger)
		this.#annotate('- dispose events')
	}

	toggleAutoRotate() {
		if (this.root.hasAttribute(this.options.attrAutoRotate)) {
			this.root.removeAttribute(this.options.attrAutoRotate)
			this.#annotate('- end auto rotate')
		} else {
			this.root.setAttribute(this.options.attrAutoRotate, '')
			this.#annotate('+ start auto rotate')
		}
	}

	with(options) {
		let merge = property => {
			if (property in this.options) {
				if (typeof options[property] === 'object')
					this.options[property] = {
						...this.options[property],
						...options[property]
					}
				else this.options[property] = options[property]
			}
		}

		for (let option in options) {
			merge(option)
		}

		// this.options = { ...this.options, ...options }
		return this
	}

	setOptimalPerspective() {
		let perspectiveVar = '--perspective'
		let winWidth = 1366
		let winHeight = 665
		let workspaceArea = winWidth * winHeight

		this.#obtainCurrentValues()
		let workspacePerspective = this.#currentValues[perspectiveVar]

		let currWidth = window.innerWidth
		let currHeight = window.innerHeight
		let currentArea = currWidth * currHeight

		let ratio = currentArea / workspaceArea
		let optimalPerspective = ratio * workspacePerspective

		if (optimalPerspective > workspacePerspective) {
			this.#rootStyles.setProperty(
				perspectiveVar,
				`${optimalPerspective}`
			)
			this.options.perspective.speed *= ratio
		}

		return this
	}
}
