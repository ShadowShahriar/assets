class attrToggle {
	constructor(parent, debug = true) {
		this.debug = debug
		this.parent = document.querySelector(parent)
		this.controls = document.querySelectorAll(`${parent} input[type="checkbox"]`)
	}

	#anonate(message) {
		if (this.debug) {
			let color = 'white'
			let symbol = message.slice(0, 1)

			switch (symbol) {
				case '-':
					color = 'orange'
					break

				case '+':
					color = 'skyblue'
					break

				default:
					break
			}

			console.log(`%c${message}`, `color: ${color}; font-weight: bold`)
		}
	}

	#update(control) {
		let body = document.body
		const { classList } = body
		let dataPrefix = control.dataset['change']
		let classPrefix = control.dataset['class']

		if (dataPrefix) {
			if (control.checked) body.setAttribute(`data-${dataPrefix}`, '')
			else body.removeAttribute(`data-${dataPrefix}`)

			let symbol = body.getAttribute(`data-${dataPrefix}`) === '' ? '+' : '-'
			this.#anonate(`${symbol} ${dataPrefix}`)
		}

		if (classPrefix) {
			if (control.checked) classList.add(classPrefix)
			else classList.remove(classPrefix)

			let symbol = [...classList].includes(classPrefix) ? '+ [class]' : '- [class]'
			this.#anonate(`${symbol} ${classPrefix}`)
		}
	}

	#set() {
		this.controls.forEach(control => {
			this.#update(control)
			control.addEventListener('change', () => this.#update(control))
		})
	}

	init() {
		this.#anonate('Current Configuration:')
		this.#set()
		this.parent.addEventListener(
			'mouseover',
			() => {
				document.body.dataset['hinted'] = ''
				this.#anonate('+ hinted')
			},
			{ once: true }
		)
		this.#anonate('Now the controls can recieve user interaction.')
	}
}
