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

function resizeBase64Img(base64, width = 512, height = 512) {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = `data:image/jpeg;base64,${base64}`;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg'));
    };
  });
}


function App() {
  const [useFullImage] = useState(true); // default to full image
  const [fullImageBase64, setFullImageBase64] = useState(null);
  const [qaAnswers, setQaAnswers] = useState({});
  const [finalPrompt, setFinalPrompt] = useState('');
  const [imagePreview, setImagePreview] = useState(null);
  const [faces, setFaces] = useState([]);
  const [approvedFaces, setApprovedFaces] = useState([]);
  const [customScenario, setCustomScenario] = useState('');
  const [selectedScenario, setSelectedScenario] = useState('');
  const [droppedFaces, setDroppedFaces] = useState([null, null]);

  const [generatedImage, setGeneratedImage] = useState(null)
  const [loading, setLoading] = useState(false)

  const [qaContext, setQaContext] = useState('');

  const [showPromptEditor, setShowPromptEditor] = useState(false);

  // const [qaQuestion, setQaQuestion] = useState('');
  // const [qaAnswer, setQaAnswer] = useState('');
  const [selectedFaceIndex, setSelectedFaceIndex] = useState(null);
  const [faceBoxes] = useState([]);
  const preExistingScenarios = [
    "____ goes to the store with their parent ____.",
    "____ visits the hair salon and greets the stylist.",
    "____ orders food at a restaurant with ____.",
    "____ asks a librarian for help finding a book with ____.",
    "____ goes to the doctor and talks about their symptoms."
  ];

  // const handleImageUpload = async (event) => {
  //   const file = event.target.files[0];
  //   if (!file) return;

  //   const reader = new FileReader();
  //   reader.onloadend = () => setImagePreview(reader.result);
  //   reader.readAsDataURL(file);

  //   const formData = new FormData();
  //   formData.append('file', file);

  //   const res = await fetch('http://localhost:8811/upload-image', {
  //     method: 'POST',
  //     body: formData,
  //   });

  //   const data = await res.json();
  //   setFaces(data.faces || []);
  // };
  const handleImageUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result); // preview
      setFullImageBase64(reader.result.split(',')[1]); // base64 only
    };
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('http://localhost:8811/upload-image', {
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
    const rawPrompt = selectedScenario || customScenario;
    if (!rawPrompt) return;

    setLoading(true);
    const fd = new FormData();

    // Build prompt
    let processedPrompt = finalPrompt;
    if (!finalPrompt.trim()) {
      let personCount = 0;
      const promptParts = rawPrompt.split('____');
      processedPrompt = promptParts.reduce((acc, part, i) => {
        acc += part;
        if (i < droppedFaces.length && droppedFaces[i]) {
          personCount++;
          acc += `person ${personCount}`;
        }
        return acc;
      }, '');
      setFinalPrompt(processedPrompt);
    }

    // ========== IMAGE HANDLING ==========

    if (useFullImage && fullImageBase64) {
      const resized = await resizeBase64Img(fullImageBase64, 512, 512);
      fd.append('ref_image1', b64toFile(resized, 'full_image.jpg'));
      fd.append('ref_task1', 'ip');
    } else if (droppedFaces[0]) {
      const masked = await createMaskedImage(imagePreview, faceBoxes, selectedFaceIndex);
      const resized = await resizeBase64Img(masked, 512, 512);
      fd.append('ref_image1', b64toFile(resized, 'masked.jpg'));
      fd.append('ref_task1', 'ip');

      if (droppedFaces[1]) {
        const resized2 = await resizeBase64Img(droppedFaces[1], 512, 512);
        fd.append('ref_image2', b64toFile(resized2, 'face2.jpg'));
        fd.append('ref_task2', 'ip');
      }
    } else {
      alert("No valid image reference found.");
      setLoading(false);
      return;
    }

    // ========== GENERATION PARAMS ==========

    fd.append('prompt', processedPrompt);
    fd.append('ref_res', '512');
    fd.append('seed', '-1');
    fd.append('guidance_scale', '7.5');
    fd.append('num_inference_steps', '30');
    fd.append('true_cfg_scale', '1.0');
    fd.append('true_cfg_start_step', '0');
    fd.append('true_cfg_end_step', '0');
    fd.append('negative_prompt', '');
    fd.append('neg_guidance_scale', '3.5');
    fd.append('first_step_guidance_scale', '4.5');

    try {
      const res = await fetch('http://localhost:8811/generate-image', {
        method: 'POST',
        body: fd,
      });

      const { image } = await res.json();
      setGeneratedImage(image);
    } catch (err) {
      console.error(err);
      alert('Generation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleAllSixSubmit = async () => {
    if (!qaContext.trim()) {
      alert("Please enter some context.");
      return;
    }

    const questions = ["Who?", "What?", "When?", "Where?", "Why?", "How?"];
    const newAnswers = {};

    for (const question of questions) {
      try {
        const res = await fetch("http://localhost:8811/ask-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context: qaContext, question }),
        });

        const data = await res.json();
        newAnswers[question] = data.answer || "No answer found.";
      } catch (err) {
        newAnswers[question] = "Error fetching answer.";
      }
    }

    setQaAnswers(newAnswers);
  };
  const formatAnswer = (text) => {
    if (!text) return "";
    return text.charAt(0).toUpperCase() + text.slice(1);
  };

  const createMaskedImage = (originalImgSrc, faceBoxes, selectedIndex) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = originalImgSrc;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");

        // Draw original image
        ctx.drawImage(img, 0, 0);

        // Draw blocks over other faces
        faceBoxes.forEach((box, i) => {
          if (i !== selectedIndex) {
            const [x, y, w, h] = box; // must be stored from CV2 or backend
            ctx.fillStyle = "#000"; // black or use blur
            ctx.fillRect(x, y, w, h);
          }
        });

        const maskedBase64 = canvas.toDataURL("image/jpeg");
        resolve(maskedBase64.split(",")[1]);
      };
    });
  };

  const highlightContext = (text, answers) => {
    let coloredText = text;
    const types = ["Who?", "What?", "When?", "Where?", "Why?", "How?"];

    types.forEach((type) => {
      const answer = answers[type];
      if (
        answer &&
        answer.trim().length > 1 &&
        text.toLowerCase().includes(answer.toLowerCase())
      ) {
        const escaped = answer.replace(/[-\\^$*+?.()|[\]{}]/g, "\\$&"); // escape special chars
        const className = `highlight-${type.toLowerCase().replace(/\?/g, "")}`;
        const regex = new RegExp(`\\b(${escaped})\\b`, "gi"); // match whole words only

        coloredText = coloredText.replace(
          regex,
          `<span class="${className}">$1</span>`
        );
      }
    });

    return <span dangerouslySetInnerHTML={{ __html: coloredText }} />;
  };



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
        <h2>Approve Family Members</h2>
        {/* <p className="intro-text">
          Below are the detected faces from your uploaded image. If you would like to exclude any, simply click the ✕ button in the top-right corner of the face.
        </p> */}

        <div className="face-boxes">
          {faces.map((face, i) => (
            <div
              className={`face-container ${selectedFaceIndex === i ? 'selected' : ''}`}
              key={i}
            >
              <img
                src={`data:image/jpeg;base64,${face}`}
                className="face-box"
                alt={`Face ${i}`}
                draggable
                onClick={() => setSelectedFaceIndex(i)} // Select this face
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


            <button
              className="edit-btn"
              onClick={handleGenerate}
              disabled={loading || !(selectedScenario || customScenario)}
            >
              {loading ? 'Generating…' : 'Generate Scene'}
            </button>

          </div>



        </section>


      )}

      {generatedImage && (
        <section className="generated-result card-box">
          <h2 className="section-heading">Your Personalized Scene</h2>

          {/* Sentence display */}
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

          {/* Final prompt edit section */}
          <div className="final-prompt-edit">
            <button
              className="edit-toggle-btn"
              onClick={() => setShowPromptEditor(!showPromptEditor)}
            >
              {showPromptEditor ? 'Hide Final Prompt' : 'Edit Final Prompt'}
            </button>

            {showPromptEditor && (
              <textarea
                value={finalPrompt}
                onChange={(e) => setFinalPrompt(e.target.value)}
                className="final-prompt-textarea"
                placeholder="This is the actual prompt that will be sent into the model."
              />
            )}
          </div>

          {/* Generated image */}
          <div className="scene-display">
            <h3 className="subheading">Generated Scene</h3>
            <img
              src={`data:image/png;base64,${generatedImage}`}
              alt="Generated Scene"
              className="generated-image-centered"
            />
          </div>

          {/* Action buttons */}
          <div className="result-buttons">
            <button
              className="regenerate-btn"
              onClick={handleGenerate}
              disabled={loading}
            >
              {loading ? 'Regenerating…' : 'Regenerate Scene'}
            </button>
          </div>
        </section>
      )}

      <section className="qa-test card-box">
        <h2>Extract Key Info from Context</h2>

        <label>
          <strong>Context</strong>
          <textarea
            className="qa-input"
            value={qaContext}
            onChange={(e) => setQaContext(e.target.value)}
            placeholder="Paste a paragraph of context here..."
          />
        </label>

        <button className="qa-btn" onClick={handleAllSixSubmit}>
          Get Context
        </button>

        {Object.keys(qaAnswers).length > 0 && (
          <div className="qa-grid">
            {["Who?", "What?", "When?", "Where?", "Why?", "How?"].map((question) => (
              <div key={question} className="qa-block">
                <h4>{question}</h4>
                <p>{formatAnswer(qaAnswers[question])}</p>
              </div>
            ))}
          </div>
        )}

        {Object.keys(qaAnswers).length > 0 && (
          <div className="highlighted-context-box">
            <h3>Highlighted Answer Sources</h3>
            <p className="highlighted-text">
              {highlightContext(qaContext, qaAnswers)}
            </p>
          </div>
        )}
      </section>


  <section className="story-matches card-box">
    <h2 className="section-heading">Matched Stories from Dataset</h2>

    <div className="label-block">
      <strong>Label:</strong> {similarStoriesData[currentIndex].Label}
    </div>

    <div className="parent-description">
      <strong>Parent Text:</strong> {similarStoriesData[currentIndex].text}
    </div>

    {[1, 2, 3].map((rank) => (
      <div key={rank} className="matched-story">
        <p>
          <strong>Story {rank} (Similarity {similarStoriesData[currentIndex][`similarity_score_${rank}`]}):</strong>
        </p>
        <div className="story-text">
          {similarStoriesData[currentIndex][`similar_story_${rank}`]
            .split('\n')
            .map((line, i) => (
              <div key={i} style={{ paddingLeft: '2rem', textIndent: '1rem' }}>
                {line}
              </div>
            ))}
        </div>
      </div>
    ))}
  </section>


    </div>
  );
}

export default App;