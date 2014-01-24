/*

Inspired by http://www.turbulence.org/Works/panemoticon/

This is a complete rewrite of that Firefox add-on, converted
the core logic to run in web content.

License from the authors: TODO

From the add-on:

The idea of using computer input devices to gather emotional data while users are
engaged in other tasks was initially proposed by Zimmermann et al (2003). We have
loosely followed their proposed method, based on the dimensional model of affect ‐ 
a way of studying emotion by breaking it down into simple components.

The Semantic Differential Scale devised by Mehrabian and Russell (1974) maps its 
survey questions onto dimensions called valence (happy/sad), arousal (calm/excited), 
and dominance (your perceived degree of control over your environment). These 
dimensions were also applied in the Self-Assessment Manikin by Lang (1980), the 
source of the blockheaded graphics we use to display and calibrate emotional data.

Affective computing--a rationale for measuring mood with mouse and keyboard.
2003. Zimmermann P, Guttormsen S, Danuser B, Gomez P.
http://www.ncbi.nlm.nih.gov/pubmed/14675525

Measuring emotion: the Self-Assessment Manikin and the Semantic Differential.
1994. Bradley MM, Lang PJ.
http://www.ncbi.nlm.nih.gov/pubmed/7962581


TODO:
* visual representation: red/yellow/green per scale, or faces
* self experiment

NEXT
* feed results back in, refining training
* content extraction and correlation as feedback loop?

*/

var userActions = [],
    gestureLog = [],
    net = new brain.NeuralNetwork(),
    savedNet = localStorage.getItem('savedNet'),
    previousTimestamp = 0

localStorage.removeItem('savedNet')
console.log('INIT', savedNet.length)

// No saved data, initializing new neural network with defaults
if (savedNet) {
  // TODO: this is where the method from the paper is really applied.
  // needs more explanation.
  // TODO: Determine training values for highs and lows of each mood vector
	net.train([
    // clicks but nothing else
    // -> dominant, not aroused
		{input: { avgGestureLength: 0, avgGestureBreadth: 0, avgGesturePause: 0, numClicks: 4, numGestures: 0, numHeavyMovements: 0 },
		  output: { dominance: 1 , arousal:0.2, valence: 0.5}},

    // nothing!
    // -> nothing
		{input: { avgGestureLength: 0, avgGestureBreadth: 0, avgGesturePause: 0, numClicks: 0, numGestures: 0, numHeavyMovements: 0 },
		  output: { dominance: 0 , arousal:0 , valence: 0.5}},

    // half gesture, with avg length of 1
    // -> not dominant, partially aroused
		{input: { avgGestureLength: 1, avgGestureBreadth: 0, avgGesturePause: 0, numClicks: 0, numGestures: 0.5, numHeavyMovements: 0 },
		  output: { dominance: 0 , arousal:0.5 , valence: 0.5}},

    // half gesture with avg length of 1 and breadth of 1
    // --> dominant, partially aroused
		{input: { avgGestureLength: 1, avgGestureBreadth: 1, avgGesturePause: 0, numClicks: 0, numGestures: 0.5, numHeavyMovements: 0 },
		  output: { dominance: 1 , arousal:0.5 , valence: 0.5}},

    // half gesture with avg length of 1 and breadth of 1 and pause of 1
    // --> dominant, slightly aroused
		{input: { avgGestureLength: 1, avgGestureBreadth: 1, avgGesturePause: 1, numClicks: 0, numGestures: 0.5, numHeavyMovements: 0 },
		  output: { dominance: 1 , arousal:0.3 , valence: 0.5}},

    // half gesture with avg length of 1 and breadth of 1 and pause of 1
    // --> dominant, slightly aroused
		{input: { avgGestureLength: 1, avgGestureBreadth: 0, avgGesturePause: 1, numClicks: 0, numGestures: 0.5, numHeavyMovements: 0 },
		  output: { dominance: 0 , arousal:0.3 , valence: 0.5}},

    // half gesture with avg length 1, breadth 0, pause 0, heavy movement 1
    // --> not dominant, very aroused
		{input: { avgGestureLength: 1, avgGestureBreadth: 0, avgGesturePause: 0, numClicks: 0, numGestures: 0.5, numHeavyMovements: 1 },
		  output: { dominance: 0 , arousal:1 , valence: 0.5}},

    // half gesture with avg length 1, breadth 1, pause 0, heavy movement 1
    // --> very dominant, very aroused
		{input: { avgGestureLength: 1, avgGestureBreadth: 1, avgGesturePause: 0, numClicks: 0, numGestures: 0.5, numHeavyMovements: 1 },
		  output: { dominance: 1 , arousal:1 , valence: 0.5}},

    // half gesture with avg length 0.5, breadth 0.5, pause 0.5, heavy movement 1 and click 0.5
    // --> not dominant, very aroused
		{input: { avgGestureLength: 0.5, avgGestureBreadth: 0.5, avgGesturePause: 0.5, numClicks: 0.5, numGestures: 0.5, numHeavyMovements: 1 },
		  output: { dominance: 0 , arousal:1 , valence: 0.5}},

    // half gesture with avg length 0.9, breadth 0.1, pause 0, heavy movement 0
    // --> not dominant, pretty aroused, and happier!
		{input: { avgGestureLength: 0.9, avgGestureBreadth: 0.1, avgGesturePause: 0, numClicks: 0, numGestures: 0.5, numHeavyMovements: 0 },
		  output: { dominance: 0 , arousal: 0.7, valence: 0.7 }}
  ]);

	localStorage.setItem('savedNet', net)
	//localStorage.setItem('savedNet', JSON.stringify(net, false, 2))
}
// Load previously saved neural network data
else {
  console.log('OLDNET', savedNet)
  // TODO: why is this necessary?
  // arbitrary training for initialization
  net.train([
    {
		  input: { avgGestureLength: 0, avgGestureBreadth: 0, avgGesturePause: 0, numClicks: 4, numGestures: 0, numHeavyMovements: 0 },
      output: { dominance: 1 , arousal:0.2, valence: 0.5}
    }
  ])

  net.fromJSON(savedNet);
}

// Once per minute, process user event data.
//
// * Iterate over all events (mousemove, click, etc)
// * Identify unique gestures
// * Summarize and store gesture data
//
function processUserEvents(){
  var date = new Date();
      numClicks = 0,
      numGestures = 0,
      previousGestureIndex = 0,
      sumGestureLength = 0,
      sumGestureBreadth = 0,
      avgGestureLength = 0,
      avgGestureBreadth = 0,
      sumGesturePause = 0,
      avgGesturePause = 0,
      numDirectionChanges = 0,
      heavyMovementDuration = 0, // to keep track of the secs
      numHeavyMovements = 0 // 5+ direction changes per 2 secs

  console.log('processUserEvents. userActions:', userActions.length)

  // Iterate over cached event data (mousemove, click, etc)
  for (var i = 0; i < userActions.length; i++) {
    var entry = userActions[i],
        previousEntry = userActions[i-1],
        previousPreviousEntry = userActions[i-2]

    // Check for direction changes
    if (i >= 2) {
      var xdiff = entry.x - previousEntry.x,
          pxdiff = previousEntry.x - previousPreviousEntry.x;
          ydiff = entry.y - previousEntry.y;
          pydiff = previousEntry.y - previousPreviousEntry.y;

      // Values can be positive or negative, so find absolute difference
      if (xdiff / Math.abs(xdiff) != pxdiff / Math.abs(pxdiff)
          || ydiff / Math.abs(ydiff) != pydiff / Math.abs(pydiff)) {
        numDirectionChanges++;
        if (heavyMovementDuration == 0) { // initialize timing
          heavyMovementDuration = entry.timestamp - previousPreviousEntry.timestamp;
        }
        if (heavyMovementDuration > 0 && heavyMovementDuration <= 2000) {
          heavyMovementDuration += entry.timestamp - previousPreviousEntry.timestamp;
        }
        if (heavyMovementDuration > 2000) {
          if (numDirectionChanges >= 5) {
            numHeavyMovements++;
          }
          numDirectionChanges = 0;
          heavyMovementDuration = 0;
        }
      }
    }

    // Click count
    if (entry.type == "click")
      numClicks++;

    // Gesture related data
    if (previousTimestamp == 0)
      previousTimestamp = entry.timestamp; // initialization

    // 500ms delay is considered the start of a gesture
    if (entry.timestamp - previousTimestamp > 500) {
      for (j = previousGestureIndex; j < i; j++) {
        sumGestureLength += distance(
          userActions[j].x,
          userActions[j].y,
          userActions[j+1].x,
          userActions[j+1].y);
      }
      sumGestureBreadth += distance(
        userActions[previousGestureIndex].x,
        userActions[previousGestureIndex].y,
        entry.x,
        entry.y)
      sumGesturePause += (entry.timestamp - previousTimestamp);
      numGestures++;
      previousTimestamp = entry.timestamp;
      previousGestureIndex = i;
      console.log("New gesture detected.");
    }
    else {
      previousTimestamp = entry.timestamp;
    }
    // End gesture related data
  }

  // If there are new gestures, record the data in the log
  if (numGestures > 0) {
    avgGestureLength = sumGestureLength / numGestures;
    avgGestureBreadth = sumGestureBreadth / numGestures;
    avgGesturePause = sumGesturePause / numGestures;

    // Store calculated values for gestures during this period
    var gestureSummary = {
      timestamp:          Date.now(),
      avgGestureLength:   Math.min(avgGestureLength / 4000.0, 1.0),
      avgGestureBreadth:  Math.min(avgGestureBreadth / 1500.0, 1.0),
      avgGesturePause:    Math.min(avgGesturePause / 20000.0, 1.0),
      numClicks:          Math.min(numClicks / 20000.0, 1.0),
      numGestures:        Math.min(numGestures / 60.0, 1.0),
      numHeavyMovements:  Math.min(numHeavyMovements / 10.0, 1.0)
    }

    // Save gesture data to log
    // TODO: WHY, since we're now training immediately
    // TODO: push training out to worker
    gestureLog.push(gestureSummary)
    var mood = net.run(gestureSummary)

    console.log("Saved new gesture data, trained and sent to UI")

    // Update UI
    self.port.emit('moodUpdate', mood)

    // Clear processed data
    userActions = [];
  }

  // If no gestures and no new gestures and nothing to process in the log
  if (numGestures == 0 && !gestureLog.length) {
    // TODO: why does this have to run so often?
    // it's already called once per minute on the timer
    // Check again in one second
    setTimeout(processUserEvents, 1000);
    console.log("No new gestures and no previously processed gesture data: waiting 1 second and calling processUserEvents again...");
  }
}
setInterval(processUserEvents, 60 * 1000)

// Every 15 minutes, purge gesture data over 1hr old
function cleanUpGestureData(){
  if (gestureLog.length) {
    var dt = Date.now()
    while ( (dt - gestureLog[0].timestamp) > 60 * 60 * 1000 /* 1hr */) {
      gestureLog.shift();
      if (gestureLog.length == 0)
        break;
    }
  }
}
setInterval(cleanUpGestureData, 15 * 60 * 1000);

// Register for user events and store them
// TODO: touch events
['click', 'mousemove'].forEach(function(eventType) {
  document.addEventListener(eventType, function eventHandler(e) {
    userActions.push({
      type: e.type,
      timestamp: Date.now(),
      url: document.location.host,
      x: e.clientX,
      y: e.clientY
    })
    console.log('user action: ', userActions[userActions.length - 1])
  }, false)
})

//----------- Helper Functions---------------
function distance(x1, y1, x2, y2) {
  return Math.sqrt( Math.pow(x1-x2, 2) + Math.pow(y1-y2, 2) );
}

/*

WORKER EXAMPLE:

importScripts("brain-0.6.0.js");

onmessage = function(event) {
  var data = JSON.parse(event.data);
  var net = new brain.NeuralNetwork();

  net.train(data, {
    iterations: 9000,
    callback: postProgress,
    callbackPeriod: 500
  });

  postMessage(JSON.stringify({type: 'result', net: net.toJSON()}));
}

function postProgress(progress) {
  progress.type = 'progress'
  postMessage(JSON.stringify(progress));
}

*/
