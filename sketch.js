let CanvasCenter
let PRODUCTION
let PreloadObjects = {}

function preload(){

	PreloadObjects.blackdesert = loadSound("./sound/blackdesert.mp3")
	PreloadObjects.c = 1
}


function setup(){

	createCanvas(windowWidth, windowHeight)
	CanvasCenter = createVector(width / 2, height / 2)
	//frameRate(40)
	angleMode(RADIANS)

	$.get("./recipients.txt", data => {

		data = JSON.parse(Uluru.decrypt(data, "vanoce"))

		let recipientName = window.location.search.slice(1).split("&")[0]
		let recipient = data[recipientName]

		if(!recipientName)
			recipient = data["demo"]

		else if(!recipient && recipientName)
			alert(`Příjemce ${recipientName} nenalezen`)

		PRODUCTION = new Production(recipient)
	})
}

function mousePressed(){

	PRODUCTION.startMusic()

	if(PRODUCTION.state != 6 || PRODUCTION.promptedPath)
		return

	PRODUCTION.capture = new CursorCapture(CanvasCenter, PRODUCTION.sandbox ? 8 : 3)
	PRODUCTION.capture.animate()
	PRODUCTION.series = null
}


function mouseReleased(){

	if(PRODUCTION.state != 6)
		return

	if(PRODUCTION.sliderX)
		return PRODUCTION.calculatePromptedSeries()

	PRODUCTION.capture.stop()

	let fourierTransform = PRODUCTION.capture.toFourierTransform()
	PRODUCTION.series = fourierTransform.transform(ceil(PRODUCTION.capture.length / 5), 0.6, 100, true)

	console.log({fourierTransform})

	PRODUCTION.series.animate(CanvasCenter, PRODUCTION.capture.totalTime * 3, randomHSLcolor(true), randomHSLcolor(false), (PreloadObjects.c++ % 2) * 16)
}

function keyPressed(){

	if(keyCode === DOWN_ARROW && PRODUCTION.state == 6)
		download("path", JSON.stringify((PRODUCTION.modifiedPath || PRODUCTION.capture).export()))
		

	if(keyCode === UP_ARROW && PRODUCTION.state == 6 && PRODUCTION.sandbox){

		let loader = new PathLoader
		PRODUCTION.promptedPath = loader.prompt()

		PRODUCTION.sliderX = createSlider(-CanvasCenter.x, CanvasCenter.x, 0, 20).position(10,10)
		PRODUCTION.sliderY = createSlider(-CanvasCenter.y, CanvasCenter.y, 0, 10).position(10,30)
		PRODUCTION.sliderScale = createSlider(0, 200, 100, 1).position(10,50)
		PRODUCTION.sliderFlip = createSlider(0, 1, 0, 1).position(10,70)
		PRODUCTION.sliderRotate = createSlider(0, 359, 0, 1).position(10,90)

		PRODUCTION.sliderSpeed = createSlider(1, 10, 2, 1).position(10,150)
		PRODUCTION.sliderAccuracy = createSlider(0, 1, 0.5, 0.05).position(10,170)

		PRODUCTION.calculatePromptedSeries()
	}
}

function simpleSeries(){

	let components = [
		{
			frequency: 1,
			amplitude: 150,
			phaseShift: -0.5*PI
		},
		{
			frequency: 2,
			amplitude: 75,
			phaseShift: -0.5*PI
		},
		{
			frequency: -5,
			amplitude: 75,
			phaseShift: 0.5*PI
		}
	]

	return [
		new FourierSeries(components.slice(0, 1)),
		new FourierSeries(components.slice(0, 2)),
		new FourierSeries(components.slice(0, 3)),
	]
}


function draw(){

	background(0)

	if(PRODUCTION)
		PRODUCTION.draw()
}

function drawText(origin, textString, size = 20, textColor = "white", style = NORMAL, alignment = CENTER){
	
	push()
	textAlign(alignment)
	textSize(size)
	textStyle(style)
	fill(textColor)
	text(textString, origin.x, origin.y)
	pop()
}

function drawPoint(vector, col, weight){

	push()

	stroke(col)
	strokeWeight(weight)
	point(vector.x, vector.y)

	pop()
}

function drawArrow(a, b, arrowColor = "rgba(255,255,255,0.8)", outlineColor = "rgba(100,150,255,0.25)"){

	let distance = a.dist(b)
	let size = sqrt(distance)//tato funkce je, jakoby, velice krásná
	let angle = atan2(b.y - a.y, b.x - a.x)

	let adjustment = createVector(
		((b.x - a.x) / distance) * size/10,
		((b.y - a.y) / distance) * size/10
	)

	push()
	
	noFill()
	strokeWeight(1)
	stroke(arrowColor)
	line(a.x, a.y, b.x - adjustment.x, b.y - adjustment.y)
	
	if(distance > 5){

		stroke(outlineColor)
		strokeWeight(1)
		circle(a.x, a.y, distance * 2)

		translate(b)
		rotate(angle)
		noStroke()
		fill(arrowColor)
		triangle(0, 0, -size, 0.5*size, -size, -0.5*size)
	}

	pop()
}


class Z {
	
	constructor(vectorOrA, b = null){

		if(b === null){
			this.a = vectorOrA.x //hold vertikální osa je naopak no
			this.b = -vectorOrA.y
		}
		else{
			this.a = vectorOrA
			this.b = b
		}
	}
	
	multiply(z2){

		let {a, b} = this
		let {a: c, b: d} = z2

		this.a = a*c - b*d //dalibor kotťák roboťák
		this.b = a*d + c*b

		return this
	}
	
	add(z2){

		this.a += z2.a
		this.b += z2.b

		return this
	}
	
	copy(){
		return new Z(this.a, this.b)
	}
	
	absolute(){
		return sqrt(this.a**2 + this.b**2)
	}
	
	angle(){
		return (-atan2(-this.b, this.a) + TWO_PI) % TWO_PI //při téhle trigonometrii jsem málem skoncoval se životem
	}
	
	toVector(){
		return createVector(this.a, -this.b)
	}
	
	vectorAngle(){

		let vec = this.toVector()
		return atan2(vec.y, vec.x)
	}
}

class ComplexFourierTransform {

	constructor(tlength, complexFunction){

		this.f = []

		for(let t = 0; t < tlength; t++)
			this.f[t] = complexFunction(t)
	}

	computeModifiedIntegral(n){

		let sum = new Z(0, 0)

		for(let t = 0; t < this.f.length; t++){
			
			let tFraction = t / this.f.length

			let ft = this.f[t]

			let theta = -n * tFraction * TWO_PI
			
			let cancellationTerm = new Z(cos(theta), sin(theta)) //=e^(-n*t*2pi*i)
			sum.add(ft.copy().multiply(cancellationTerm))
		}
	
		return new Z(sum.a / this.f.length, sum.b / this.f.length)
	}

	transform(accuracy = 25, minAmplitude = 1, componentLimit = Infinity, sortByAmplitude = true, sortByFrequency = false){

		let components = []
		
		for(let n = -accuracy; n <= accuracy; n++){
			
			let cn = this.computeModifiedIntegral(n)

			let amplitude = cn.absolute()

			if(amplitude >= minAmplitude)
				components.push({
					frequency: n,
					amplitude,
					phaseShift: cn.angle(),
				})
		}

		if(sortByFrequency)
			components.sort((a, b) => abs(a.frequency) - abs(b.frequency))

		if(sortByAmplitude)
			components.sort((a, b) => b.amplitude - a.amplitude)

		return new FourierSeries(components.slice(0, componentLimit))
	}
}

class SmoothFourierTransform extends ComplexFourierTransform {

	constructor(smoothness, realComponentFunction, complexComponentFunction){

		let complexFunction = t => new Z(
			realComponentFunction(t / smoothness),
			complexComponentFunction(t / smoothness)
		)

		super(smoothness, complexFunction)
	}
}

class FourierSeries {

	constructor(components){

		this.components = components
		this.path = new Path(true)
	}

	animate(origin, period, color1 = "yellow", color2 = "black", glow = false){

		this.animation = {
			origin,
			period,
			start: millis()
		}

		this.path.animate(createVector(0, 0), 2, color1, period, true, color2, glow)
	}
	
	compute(tFraction, origin){
	
		let currentPosition = new Z(origin)
		let pointers = [currentPosition.toVector()]
		
		for(let i = 0, l = this.components.length; i < l; i++){
			
			let component = this.components[i]
			let pos = component.phaseShift + component.frequency * tFraction * TWO_PI
			let zn = new Z(cos(pos) * component.amplitude, sin(pos) * component.amplitude)

			currentPosition.add(zn)
			pointers.push(currentPosition.toVector())
		}
		this.path.extend(pointers[pointers.length - 1])
		
		return pointers
	}
	
	draw(){

		if(!this.animation)
			return

		let t = millis() - this.animation.start
		let tFraction = (t % this.animation.period) / this.animation.period

		let pointers = this.compute(tFraction, this.animation.origin)

		this.path.draw()

		for(let i = 0, l = pointers.length; i < l - 1; i++)
			drawArrow(pointers[i], pointers[i+1])	
	}
}

class Path {

	constructor(deleteOld = false){

		this.vertices = []
		this.dissipate = deleteOld
	}

	animate(origin, weight, color1, lifetime = Infinity, fade = false, color2 = "black", glow = 0){

		this.animation = {
			origin,
			weight,
			color1: color(color1),
			lifetime,
			fade,
			color2: color(color2),
			glow
		}
	}

	extend(vector){

		this.vertices.push({
			vector,
			tAdded: millis()
		})
	}

	vector(index){

		return this.vertices[index].vector
	}

	get length(){

		return this.vertices.length
	}

	toFourierTransform(){

		return new ComplexFourierTransform(
			this.length,
			t => new Z(this.vector(t))
		)
	}

	modify(x, y, scale, flip, rotate = 0){

		let path = new Path

		for(let v = 0, l = this.vertices.length; v < l; v++)
			path.extend(
				this.vertices[v].vector.copy().mult(scale).add(x, y).mult(1, flip ? -1 : 1).rotate(rotate)
			)

		return path
	}

	export(){

		return {
			path: this.vertices.map(vx => [round(vx.vector.x, 2), round(vx.vector.y, 2)])
		}
	}

	draw(){

		if(!this.animation)
			return

		let minTadded = millis() - this.animation.lifetime
		let toDelete = 0

		push()

		if(this.animation.glow)
			drawingContext.shadowBlur = this.animation.glow

		stroke(this.animation.color1)
		strokeWeight(this.animation.weight)
		noFill()

		if(this.animation.fade){

			let lastVertex = this.vertices[0]

			for(let v = 1, l = this.vertices.length; v < l; v++){

				let nextVertex = this.vertices[v]
				colorMode(HSL)

				if(nextVertex.tAdded > minTadded){

					let lightness = (nextVertex.tAdded - minTadded) / this.animation.lifetime
					let currentColor = lerpColor(this.animation.color1, this.animation.color2, 1 - lightness)
					
					stroke(currentColor)

					if(this.animation.glow && (v & 7) == 0) //optimalizace, pouze každý osmý vektor měnit barvu stínu
						drawingContext.shadowColor = color(currentColor)

					line(
						lastVertex.vector.x + this.animation.origin.x, lastVertex.vector.y + this.animation.origin.y,
						nextVertex.vector.x + this.animation.origin.x, nextVertex.vector.y + this.animation.origin.y,
					)
				}
				else
					toDelete++

				lastVertex = nextVertex
			}
		}
		else{

			beginShape()

			for(let v = 0, l = this.vertices.length; v < l; v++){

				let vtx = this.vertices[v]

				if(vtx.tAdded > minTadded)
					curveVertex(
						vtx.vector.x + this.animation.origin.x,
						vtx.vector.y + this.animation.origin.y
					)
				else
					toDelete++
			}

			endShape()
		}

		pop()

		if(this.dissipate)
			this.vertices = this.vertices.slice(toDelete)
	}

}

class PathLoader {

	constructor(pathFileURI){

		this.uri = pathFileURI		
	}

	async load(){

		return new Promise((resolve, reject) => {

			jQuery.get(this.uri, function(data){

				let objectJSON = data//JSON.parse(data)
				let vectors = objectJSON.path.map(coords => createVector(coords[0], coords[1]))

				let path = new Path

				vectors.forEach(v => path.extend(v))

				let totalTime = objectJSON.totalTime

				resolve({path, totalTime})
			})
		})
	}

	prompt(){

		let ptsString = prompt("Vložte String bodů")

		let path = new Path

		ptsString.split("\n").forEach(ptStr => path.extend(
			createVector(...ptStr.split(",").map(Number)).sub(CanvasCenter)
		))

		return path
	}
}

class CursorCapture extends Path {

	constructor(origin, smoothness = 0){

		super()

		this.origin = origin
		this.cursor = createVector(mouseX - this.origin.x, mouseY - this.origin.y)
		this.smoothness = smoothness

		this.start = millis()
		this.totalTime = NaN
	}

	animate(origin = this.origin, weight = 1, color1 = color(50, 255, 20), lifetime = Infinity, fade = false, color2 = "black"){

		super.animate(origin, weight, color1, lifetime, fade, color2)
	}

	capture(){

		if(this.totalTime)
			return false
		
		this.extend(createVector(
			this.cursor.x,
			this.cursor.y
		))

		this.cursor = createVector(
			((this.smoothness - 1) * this.cursor.x + mouseX - this.origin.x) / this.smoothness,
			((this.smoothness - 1) * this.cursor.y + mouseY - this.origin.y) / this.smoothness
		)
	}

	stop(){

		this.totalTime = millis() - this.start
	}

	export(){

		let obj = super.export()
		obj.totalTime = this.totalTime

		return obj
	}
}


class Production {

	constructor(recipientObject){

		this.soundTrack = PreloadObjects.blackdesert
		this.musicPlaying = false

		if(!recipientObject){
			this.state = 6
			this.sandbox = true
			return
		}

		this.for = recipientObject.for
		this.greeting = recipientObject.greeting
		this.reasoning = recipientObject.reasoning
		this.art = recipientObject.art

		$("title").text(this.for)

		this.state = 0
		this.series = null
		this.capture = null


		this.simple = simpleSeries()[0]
		this.simple.animate(CanvasCenter.copy().add(0,100), 10000, randomHSLcolor(true), randomHSLcolor(false))
		this.nextButton = createButton("Pokračovat", "A").addClass("nextbutton")
	
		$(this.nextButton.elt).on("click", () => this.nextState())
		
		let loader = new PathLoader(this.art)

		loader.load().then(({path, totalTime}) => {
	
			let fourierTransform = path.modify(0, 0, height / 919, false, 0).toFourierTransform()
			this.series = fourierTransform.transform(ceil(path.length / 5), 0.31415926, 100, true, true) //easter egg
			this.seriesTime = (totalTime || 18000) * 2

			this.series.animate(CanvasCenter, this.seriesTime, randomHSLcolor(true), randomHSLcolor(false), 16)

			console.log({fourierTransform})
		})
	}

	startMusic(){

		if(this.musicPlaying)
			return

		this.musicPlaying = true

		this.soundTrack.setVolume(0.4)
		this.soundTrack.loop()

		setTimeout(() => this.soundTrack.setVolume(0.12, 3, 6), 100)
	}

	nextState(){
		
		this.state++
		this.nextButton.removeClass("nextbutton").addClass("nobutton")
		if(this.state < 4)
			this.simple.components = simpleSeries()[this.state - 1].components

		if(this.state == 6){
			this.series = null
			this.capture = null
		}
		else
			setTimeout(
				() => this.nextButton.removeClass("nobutton").addClass("nextbutton"),
				this.state != 5 ? 10000 : this.seriesTime
			)
	}

	draw(){

		drawText(createVector(10, height - 10), "od Franty", 15, "grey", BOLD, LEFT)

		switch(this.state){
			case 0:
				drawText(CanvasCenter, this.for, 150, "rgba(255,255,255,0.1)", BOLD)
				drawText(
					CanvasCenter.copy().add(0, -100),
					"Dívej se na počítači",
					40, "white"
				)
				break

			case 1:
				drawText(
					CanvasCenter.copy().add(0, -200),
					this.greeting + ", dávej pozor. Naprogramoval jsem něco, co by se ti mohlo líbit.",
					20, "white"
				)
				drawText(
					CanvasCenter.copy().add(0, -150),
					"Díval jsem se na to, jak krestlit pomoci otáčení šipek. Takhle funguje jedna šipka, otáčí se na místě a vykresluje kružnici:",
					20, "white"
				)
				this.simple.draw()
				break

			case 2:
				drawText(
					CanvasCenter.copy().add(0, -150),
					"Když na ni přidáš tuhle menší šipku a správně jim nastavíš velikost a rychlost, tak budou kreslit třeba tohle srdíčko (kardioid):",
					20, "white"
				)
				this.simple.draw()
				break

			case 3:
				drawText(
					CanvasCenter.copy().add(0, -150),
					"Každá další šipka pomáhá tvořit složitější obrázky, když přidáš ještě jednu, máš tohodle panáčka :D",
					20, "white"
				)
				this.simple.draw()
				break

			case 4:
				drawText(
					CanvasCenter.copy().add(0, -150),
					"A tak jsem spojil " + this.series.components.length + " různých šipek aby nakreslily něco pro tebe.",
					25, "white", ITALIC
				)
				drawText(
					CanvasCenter.copy().add(0, -100),
					this.reasoning,
					25, "white", ITALIC
				)
				drawText(
					CanvasCenter.copy().add(0, 300),
					"Metodě, kterou jsem k tomu použil, se říka komplexní Fourierova transformace a je to jedna z nejkrásnějších částí matematiky, co jsem kdy viděl.",
					20, "white"
				)
				break

			case 5:
				drawText(CanvasCenter, this.for, 150, "rgba(255,255,255,0.1)", BOLD)
				this.series.draw()
				break

			case 6:
				if(this.series)
					this.series.draw()
				else if(this.capture){
					this.capture.capture()
					this.capture.draw()
				}
				else{
					drawText(
						CanvasCenter.copy().add(0, -100),
						"Můžeš si zkusit myší nakreslit jakoukoliv jednotažku (uzavřenou malůvku, musí začínat tam kde skončila) a Fourierova transformace se postará o zbytek",
						20, "white"
					)
				}
				break
		}
	}

	calculatePromptedSeries(){

		this.modifiedPath = this.promptedPath.modify(
			this.sliderX.value(),
			this.sliderY.value(),
			(this.sliderScale.value() / 100)**4,
			this.sliderFlip.value(),
			this.sliderRotate.value() / 360 * TWO_PI,
		)
		
		let fourierTransform = this.modifiedPath.toFourierTransform()

		this.series = fourierTransform.transform(ceil(this.modifiedPath.length / 5), this.sliderAccuracy.value(), 200, true, true)
	
		console.log({fourierTransform})

		this.series.animate(CanvasCenter, this.sliderSpeed.value()**2 *1000, randomHSLcolor(true), randomHSLcolor(false))
	}
}

function randomHSLcolor(light = true){
	return light ? `hsl(${floor(random(0,360))},${floor(random(70,100))}%,${floor(random(55,70))}%)` :`hsl(${floor(random(0,360))},${floor(random(50,80))}%,${floor(random(0,5))}%)`
}

function round(x, decimals){
	return Math.round(x * 10**decimals) / 10**decimals
}

function download(filename, text) {
	var element = document.createElement('a');
	element.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(text));
	element.setAttribute('download', filename + ".json");
  
	element.style.display = 'none';
	document.body.appendChild(element);
  
	element.click();
  
	document.body.removeChild(element);
}