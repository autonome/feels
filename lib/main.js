var pageMod = require('sdk/page-mod'),
    data = require('sdk/self').data

pageMod.PageMod({
  include: '*',
  contentScriptWhen: 'end',
  contentScriptFile: [
    data.url('brain-0.6.0.js'),
    data.url('logger.js')
  ],
  onAttach: function onAttach(worker) {
    worker.port.on('moodUpdate', onMoodUpdate)
  }
})

var {Widget} = require('sdk/widget')
var widget = Widget({
  id: 'feels-',
  label: 'Feels',
  contentURL: 'data:text/html,Feels'
})

function onMoodUpdate(mood) {
  var moodText = [
    'Dominance (feeling of control): ' + round(mood.dominance),
    'Arousal (calm/excited): ' + round(mood.arousal),
    'Valence (happy/sad): ' + round(mood.valence)
  ].join(', ')

  // background: -moz-linear-gradient(left, green, red);

  widget.contentURL = 'data:text/html,' + moodText
  widget.tooltip = moodText
  widget.width = moodText.length * 6.2

  console.log('updated mood', moodText)
}

function round(num) {
  return Math.round(num * 10) / 10
}

