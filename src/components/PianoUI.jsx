import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Piano, MidiNumbers } from 'react-piano';
import 'react-piano/dist/styles.css';

// Assume these imports are in your project
import DimensionsProvider from './DimensionsProvider';
import SoundfontProvider from './SoundfontProvider';
import './styles.css';
import {isPianoOpen} from './UIStates'

// webkitAudioContext fallback needed to support Safari
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const soundfontHostname = 'https://d1pzp51pvbm36p.cloudfront.net';

const noteRange = {
  first: MidiNumbers.fromNote('c2'),
  last: MidiNumbers.fromNote('c7'),
};

// Full list of keyboard shortcuts, including uppercase keys for accidentals
const keyboardShortcuts = [
  { key: '1', midiNumber: MidiNumbers.fromNote('c2') },
  { key: '!', midiNumber: MidiNumbers.fromNote('c#2') },
  { key: '2', midiNumber: MidiNumbers.fromNote('d2') },
  { key: '@', midiNumber: MidiNumbers.fromNote('d#2') },
  { key: '3', midiNumber: MidiNumbers.fromNote('e2') },
  { key: '4', midiNumber: MidiNumbers.fromNote('f2') },
  { key: '$', midiNumber: MidiNumbers.fromNote('f#2') },
  { key: '5', midiNumber: MidiNumbers.fromNote('g2') },
  { key: '%', midiNumber: MidiNumbers.fromNote('g#2') },
  { key: '6', midiNumber: MidiNumbers.fromNote('a2') },
  { key: '^', midiNumber: MidiNumbers.fromNote('a#2') },
  { key: '7', midiNumber: MidiNumbers.fromNote('b2') },
  { key: '8', midiNumber: MidiNumbers.fromNote('c3') },
  { key: '*', midiNumber: MidiNumbers.fromNote('c#3') },
  { key: '9', midiNumber: MidiNumbers.fromNote('d3') },
  { key: '(', midiNumber: MidiNumbers.fromNote('d#3') },
  { key: '0', midiNumber: MidiNumbers.fromNote('e3') },
  { key: 'q', midiNumber: MidiNumbers.fromNote('f3') },
  { key: 'Q', midiNumber: MidiNumbers.fromNote('f#3') },
  { key: 'w', midiNumber: MidiNumbers.fromNote('g3') },
  { key: 'W', midiNumber: MidiNumbers.fromNote('g#3') },
  { key: 'e', midiNumber: MidiNumbers.fromNote('a3') },
  { key: 'E', midiNumber: MidiNumbers.fromNote('a#3') },
  { key: 'r', midiNumber: MidiNumbers.fromNote('b3') },
  { key: 't', midiNumber: MidiNumbers.fromNote('c4') },
  { key: 'T', midiNumber: MidiNumbers.fromNote('c#4') },
  { key: 'y', midiNumber: MidiNumbers.fromNote('d4') },
  { key: 'Y', midiNumber: MidiNumbers.fromNote('d#4') },
  { key: 'u', midiNumber: MidiNumbers.fromNote('e4') },
  { key: 'i', midiNumber: MidiNumbers.fromNote('f4') },
  { key: 'I', midiNumber: MidiNumbers.fromNote('f#4') },
  { key: 'o', midiNumber: MidiNumbers.fromNote('g4') },
  { key: 'O', midiNumber: MidiNumbers.fromNote('g#4') },
  { key: 'p', midiNumber: MidiNumbers.fromNote('a4') },
  { key: 'P', midiNumber: MidiNumbers.fromNote('a#4') },
  { key: 'a', midiNumber: MidiNumbers.fromNote('b4') },
  { key: 's', midiNumber: MidiNumbers.fromNote('c5') },
  { key: 'S', midiNumber: MidiNumbers.fromNote('c#5') },
  { key: 'd', midiNumber: MidiNumbers.fromNote('d5') },
  { key: 'D', midiNumber: MidiNumbers.fromNote('d#5') },
  { key: 'f', midiNumber: MidiNumbers.fromNote('e5') },
  { key: 'g', midiNumber: MidiNumbers.fromNote('f5') },
  { key: 'G', midiNumber: MidiNumbers.fromNote('f#5') },
  { key: 'h', midiNumber: MidiNumbers.fromNote('g5') },
  { key: 'H', midiNumber: MidiNumbers.fromNote('g#5') },
  { key: 'j', midiNumber: MidiNumbers.fromNote('a5') },
  { key: 'J', midiNumber: MidiNumbers.fromNote('a#5') },
  { key: 'k', midiNumber: MidiNumbers.fromNote('b5') },
  { key: 'l', midiNumber: MidiNumbers.fromNote('c6') },
  { key: 'L', midiNumber: MidiNumbers.fromNote('c#6') },
  { key: 'z', midiNumber: MidiNumbers.fromNote('d6') },
  { key: 'Z', midiNumber: MidiNumbers.fromNote('d#6') },
  { key: 'x', midiNumber: MidiNumbers.fromNote('e6') },
  { key: 'c', midiNumber: MidiNumbers.fromNote('f6') },
  { key: 'C', midiNumber: MidiNumbers.fromNote('f#6') },
  { key: 'v', midiNumber: MidiNumbers.fromNote('g6') },
  { key: 'V', midiNumber: MidiNumbers.fromNote('g#6') },
  { key: 'b', midiNumber: MidiNumbers.fromNote('a6') },
  { key: 'B', midiNumber: MidiNumbers.fromNote('a#6') },
  { key: 'n', midiNumber: MidiNumbers.fromNote('b6') },
  { key: 'm', midiNumber: MidiNumbers.fromNote('c7') }
];

// ------------------- APP -------------------
export function PianoUI() {
  const [transposition, setTransposition] = useState(0);
  const [isSustain, setIsSustain] = useState(false);
  const [allNotesPlaying, setAllNotesPlaying] = useState(new Set());

  const handleTransposeChange = (e) => {
    const value = parseInt(e.target.value, 10);
    setTransposition(isNaN(value) ? 0 : value);
  };
  
  const handleSustainToggle = () => {
    setIsSustain(!isSustain);
    // If sustain is being turned off, stop all currently playing notes.
    // In a full implementation, you'd trigger a note stop via state/props here.
    if (isSustain) {
      // stopAllPlayingNotes(); 
    }
  };
  
  // const stopAllPlayingNotes = () => {
  //   // Placeholder from original code
  // };

return (
  <div className="flex flex-col items-center text-center">
    <h2 className="text-2xl font-bold">react-piano demos</h2>
    <div className="mt-5">
      <p className="text-lg">Use the buttons or input to transpose key mapping:</p>
      <div className="flex items-center justify-center gap-2">
        <button 
          onClick={() => setTransposition(t => t - 1)} 
          className="px-4 py-2 font-semibold text-white bg-blue-500 rounded-md shadow-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-150 ease-in-out"
        >
          Transpose -1
        </button>
        <input
          type="number"
          value={transposition}
          onChange={handleTransposeChange}
          className="w-16 px-2 py-1 text-center border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
        <button 
          onClick={() => setTransposition(t => t + 1)} 
          className="px-4 py-2 font-semibold text-white bg-blue-500 rounded-md shadow-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition duration-150 ease-in-out"
        >
          Transpose +1
        </button>
        <button 
          onClick={() => setTransposition(0)} 
          className="px-4 py-2 font-semibold text-white bg-gray-500 rounded-md shadow-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition duration-150 ease-in-out"
        >
          Reset
        </button>
      </div>
      <p className="mt-4 text-lg">Current transposition: <span className="font-bold">{transposition}</span></p>

      <p className="mt-4 text-lg">Sustain Pedal: 
        <button 
          onClick={handleSustainToggle}
          className={`ml-2 px-4 py-2 font-semibold text-white rounded-md shadow-md transition duration-150 ease-in-out ${isSustain ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'}`}
        >
          {isSustain ? 'On' : 'Off'}
        </button>
      </p>
      
      <ResponsivePiano
        transposition={transposition}
        isSustain={isSustain}
      />
    </div>
  </div>
);
}

// ------------------- FIX: Apply transposition to all shortcuts -------------------
function ResponsivePiano(props) {
  // Destructure the transposition prop
  const { isSustain, transposition, ...rest } = props;
  
  // 1. Calculate transposed keyboard shortcuts
  // This applies the transposition to ALL keys, including the uppercase ones (like 'Q', 'W', etc.)
  const transposedKeyboardShortcuts = keyboardShortcuts.map(shortcut => ({
    ...shortcut,
    // Add the transposition value to the original MIDI number
    midiNumber: shortcut.midiNumber + transposition,
  }));
  
  // 2. Calculate transposed note range for the visual display
  const transposedNoteRange = {
    first: noteRange.first + transposition,
    last: noteRange.last + transposition,
  };

  return (
    <DimensionsProvider>
      {({ containerWidth }) => (
        <SoundfontProvider
          instrumentName="acoustic_grand_piano"
          audioContext={audioContext}
          hostname={soundfontHostname}
          render={({ isLoading, playNote, stopNote, stopAllNotes }) => (
            <Piano
              // Pass the transposed note range (for visual keys)
              noteRange={transposedNoteRange} 
              width={containerWidth}
              playNote={(midiNumber) => {
                if (isPianoOpen()) {
                  playNote(midiNumber);
                }
              }}
              stopNote={(midiNumber) => {
                // Sustain logic check
                if (isPianoOpen() && !isSustain) {
                  stopNote(midiNumber);
                }
              }}
              disabled={isLoading}
              // Pass the *transposed* keyboard shortcuts (for key input)
              keyboardShortcuts={transposedKeyboardShortcuts} 
              {...rest}
            />
          )}
        />
      )}
    </DimensionsProvider>
  );
}
// --------------------------------------------------------------------------------