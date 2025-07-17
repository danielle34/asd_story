import React, { useState } from 'react';
import './App.css';

function b64toFile(dataURL, filename) {
  const [header, b64] = dataURL.split(',')
  const mime = header.match(/:(.*?);/)[1]
  const binary = atob(b64)
  const len = binary.length
  const u8 = new Uint8Array(len)
  for (let i = 0; i < len; i++) u8[i] = binary.charCodeAt(i)
  return new File([u8], filename, { type: mime })
}




function App() {
  const [imagePreview, setImagePreview] = useState(null);
  const [faces, setFaces] = useState([]);
  const [approvedFaces, setApprovedFaces] = useState([]);
  const [customScenario, setCustomScenario] = useState('');
  const [selectedScenario, setSelectedScenario] = useState('');
  const [droppedFaces, setDroppedFaces] = useState([null, null]);

  const [generatedImage, setGeneratedImage] = useState(null)
  const [loading, setLoading]             = useState(false)


  const preExistingScenarios = [
    "____ goes to the store with their parent ____.",
    "____ visits the hair salon and greets the stylist.",
    "____ orders food at a restaurant with ____.",
    "____ asks a librarian for help finding a book with ____.",
    "____ goes to the doctor and talks about their symptoms."
  ];

  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('http://127.0.0.1:8000/upload-image', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    setFaces(data.faces || []);
  };

  const removeFace = (index) => {
    setFaces(faces.filter((_, i) => i !== index));
  };

  const approveFaces = () => {
    setApprovedFaces(faces);
  };

  const handleDrop = (e, index) => {
    const faceIndex = e.dataTransfer.getData('faceIndex');
    if (faceIndex !== '') {
      const newDropped = [...droppedFaces];
      newDropped[index] = faces[parseInt(faceIndex)];
      setDroppedFaces(newDropped);
    }
  };
const handleGenerate = async () => {
  // require at least one approved face and a prompt
  const prompt = selectedScenario || customScenario
  if (!approvedFaces.length || !prompt) return

  setLoading(true)
  const fd = new FormData()

  // face #1
  fd.append(
    'ref_image1',
    b64toFile(`data:image/jpeg;base64,${approvedFaces[0]}`, 'face1.jpg')
  )
  // face #2 (optional)
  if (approvedFaces[1]) {
    fd.append(
      'ref_image2',
      b64toFile(`data:image/jpeg;base64,${approvedFaces[1]}`, 'face2.jpg')
    )
  }

  fd.append('ref_task1', 'ip')
  fd.append('ref_task2', 'ip')
  fd.append('prompt', prompt)

  try {
    const res = await fetch('http://localhost:8000/generate-image', {
      method: 'POST',
      body: fd,
    })
    const { image /* base64 PNG */ } = await res.json()
    setGeneratedImage(image)
  } catch (err) {
    console.error(err)
    alert('Generation failed')
  } finally {
    setLoading(false)
  }
}
  return (
    <div className="app">

      <section className="card-box intro-upload-area">
        <h1>Personalized Stories</h1>
        {/* <p className="intro-text">
          We understand that getting your child interested in learning can be challenging. When they see familiar faces in of people they know and love, learning becomes more engaging. We hope this tool will help your child stay attentive and curious by watching their family members in everyday scenarios.
        </p> */}
        <p className="intro-text">
          Upload a family photo and select the members you'd like to feature in a story. You'll get to review and approve every image before your child sees it.
        </p>

        <label className="upload-button">
          Upload Family Picture
          <input type="file" accept="image/*" hidden onChange={handleImageUpload} />
        </label>

        {/* <p className="upload-note">
          Privacy Notice: All images are processed locally on your device. We do not store, access, or transmit any of your uploaded photos. We understand that family imagery is deeply personal, and your data remains entirely private and secure throughout the experience.
        </p> */}
      </section>

      <section className="card-box selection-area">
        <h2>👨‍👩‍👧‍👦 Approve Family Members</h2>
        {/* <p className="intro-text">
          Below are the detected faces from your uploaded image. If you would like to exclude any, simply click the ✕ button in the top-right corner of the face.
        </p> */}

        <div className="face-boxes">
          {faces.map((face, i) => (
            <div className="face-container" key={i}>
              <img
                src={`data:image/jpeg;base64,${face}`}
                className="face-box"
                alt={`Face ${i}`}
                draggable
                onDragStart={(e) => e.dataTransfer.setData('faceIndex', i)}
              />
              <button className="delete-button" onClick={() => removeFace(i)}>✕</button>
            </div>
          ))}
        </div>

        <div className="preview">
          {imagePreview ? (
            <img src={imagePreview} alt="Family" className="preview-image" />
          ) : (
            'Family Picture'
          )}
        </div>

        <div className="start-btn-container">
          <button className="start-btn" onClick={approveFaces}>
            Approved ({faces.length})
          </button>
        </div>
      </section>

      {approvedFaces.length > 0 && (
        <section className="scenario-container">
          <div className="scenario-left">
            <h2>Make Your Own Scenario</h2>
            {/* <p className="intro-text">
              We aim to help your child learn communication and social skills. You can type your own prompt below or choose from a selection of pre-existing ones. Please note: we do not allow harmful, inappropriate, or unsafe prompts and will automatically block content that violates our guidelines.
            </p> */}

            <h2>Pre-Existing Prompts</h2>
            <div className="pre-existing-list">
              {preExistingScenarios.map((s, i) => (
                <div key={i} className="pre-item" onClick={() => setSelectedScenario(s)}>
                  {s}
                </div>
              ))}
            </div>

            <h3>OR</h3>
            <textarea
              className="custom-input"
              value={customScenario}
              onChange={(e) => setCustomScenario(e.target.value)}
              placeholder="Type your scenario here..."
            />

          </div>

          <div className="scenario-right">
            <h2>Pick Family Members for the Scenario</h2>
            <p className="intro-text">
              Drag and drop your approved family members into the circles below. This helps us generate a personalized scene that places those family members into the story action.
            </p>
            <div className="face-row">
              {approvedFaces.map((face, i) => (
                <img
                  key={i}
                  src={`data:image/jpeg;base64,${face}`}
                  className="face-box-small"
                  alt={`Approved ${i}`}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('faceIndex', i)}
                />
              ))}
            </div>

            <div className="prompt-box">
              {selectedScenario || customScenario || 'The prompt will be generated here.'}
            </div>

            <div className="generated-sentence">
              {(() => {
                const scenario = selectedScenario || customScenario || '';
                const parts = scenario.split('____');
                const elements = [];

                for (let i = 0; i < parts.length; i++) {
                  elements.push(<span key={`text-${i}`}>{parts[i]}</span>);
                  if (i < parts.length - 1) {
                    elements.push(
                      <span
                        key={`drop-${i}`}
                        className="blank-circle"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDrop(e, i)}
                      >
                        {droppedFaces[i] && (
                          <img
                            src={`data:image/jpeg;base64,${droppedFaces[i]}`}
                            alt=""
                            className="face-thumb"
                          />
                        )}
                      </span>
                    );
                  }
                }

                return elements;
              })()}
            </div>

            <button className="edit-btn">EDIT PROMPT</button>
            <button
  className="generate-btn"
  onClick={handleGenerate}
  disabled={loading || !(selectedScenario || customScenario)}
>
  {loading ? 'Generating…' : 'Generate Scene'}
</button>
            
          </div>



        </section>


      )}

      {generatedImage && (
  <section className="generated-result">
    <h2>Your Generated Image</h2>
    <img
      src={`data:image/png;base64,${generatedImage}`}
      alt="Generated Scene"
      className="generated-image"
    />
  </section>
)}

{/* {(selectedScenario || customScenario) && droppedFaces.every(Boolean) && (
  <section className="card-box">
    <h2 className="section-heading">🎨 Preview Your Personalized Scene</h2>

     <div className="generated-sentence">
              {(() => {
                const scenario = selectedScenario || customScenario || '';
                const parts = scenario.split('____');
                const elements = [];

                for (let i = 0; i < parts.length; i++) {
                  elements.push(<span key={`text-${i}`}>{parts[i]}</span>);
                  if (i < parts.length - 1) {
                    elements.push(
                      <span
                        key={`drop-${i}`}
                        className="blank-circle"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDrop(e, i)}
                      >
                        {droppedFaces[i] && (
                          <img
                            src={`data:image/jpeg;base64,${droppedFaces[i]}`}
                            alt=""
                            className="face-thumb"
                          />
                        )}
                      </span>
                    );
                  }
                }

                return elements;
              })()}
            </div>

    <div className="generated-image-container">
      <img
        src="/path-to-generated-image.jpg"
        alt="Generated Scenario"
        className="generated-image"
      />
    </div>

    <div className="review-buttons">
      <button className="approve-btn">Approve</button>
      <button className="regenerate-btn">Regenerate</button>
    </div>
  </section>
)} */}

    </div>
  );
}

export default App;