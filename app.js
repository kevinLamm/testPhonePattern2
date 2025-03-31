import jsaruco from "https://cdn.skypack.dev/js-aruco@0.1.0";
    
    // Extract AR and POS (choose POS1 or POS2 based on your needs)
    const AR = jsaruco.AR;
    const POS = jsaruco.POS1;  // or jsaruco.POS2
    
    
    console.log("AR:", AR);
   
    console.log("POS:", POS);

let video = document.createElement("video"); // Hidden video element
// Hide the video element (it will still capture frames)
video.style.display = "none";
document.body.appendChild(video);
let canvas = document.getElementById("canvas");  // Visible canvas for display
let processingCanvas = document.getElementById("processing-canvas"); // Offscreen canvas for processing
let ctx = canvas.getContext("2d");
//const captureButton = document.getElementById("capture-process");
const cameraView = document.getElementById('camera-view');
let activePatternIndex = null;
let threshValue = 220;
let threshInvert = false;
// Global variables for storing data from each frame
let lastLargestContour = null;
let lastMarkerHomography = null; // Homography computed from the marker corners

 

let project = {
    name: "",
    patterns: []
  };

let currentStream = null;
let useBackCamera = true; // Default to back camera
let processing = true; // Enable processing




window.addEventListener("load", () => {
    const splash = document.getElementById("splash-screen");
    if (splash) {
      splash.style.display = "none";
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    // Initialize global project variable
    window.project = {
      name: "",
      patterns: []
    };
    const menu = document.getElementById('menu-nav');
  
  document.getElementById('menu-btn').addEventListener('click', () => {
    console.log("Is aruco installed?");
  
    menu.classList.toggle('hidden');
  });
  
  document.getElementById('new-project').addEventListener('click', () => {
    project.name = "";
    project.patterns = [];
    document.getElementById('project-name').value = "";
    renderPatternList();
    menu.classList.toggle('hidden');
  });
  
  document.getElementById('open-project').addEventListener('click', () => {
    // Add logic to load a project (e.g., from local storage or file upload)
    alert("Open Project functionality goes here.");
    menu.classList.toggle('hidden');
  });
  
  document.getElementById('save-project').addEventListener('click', () => {
    // Add logic to save the project (e.g., download JSON or use local storage)
    alert("Save Project functionality goes here.");
    menu.classList.toggle('hidden');
  });
  
  document.getElementById('share-project').addEventListener('click', () => {
    // Implement share (e.g., generate shareable link or JSON export)
    alert("Share Project functionality goes here.");
    menu.classList.toggle('hidden');
  });
  
  document.getElementById("marker-btn").addEventListener("click", function() {
    menu.classList.toggle('hidden');
    window.open('Marker.pdf', '_blank'); // Open the PDF in a new tab
  });

  document.getElementById('settings-btn').addEventListener('click', () => {
    // Open settings modal or navigate to settings page
    alert("Settings functionality goes here.");
    menu.classList.toggle('hidden');
  });
  
  document.getElementById('close-camera').addEventListener('click', () => {
    toggleCameraView();
    // Global variables for storing data from each frame


  });
  
});

function toggleCameraView() {    
    // If the camera view is currently hidden, show it and start the camera.
    if (cameraView.classList.contains('hidden')) {
      cameraView.classList.remove('hidden');
      requestWakeLock();
      startCamera("environment");
    } else {
      // If it's visible, hide it and stop the camera stream.
      cameraView.classList.add('hidden');
      releaseWakeLock();
      // Stop the stream if it exists.
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
        lastLargestContour = null;
        lastMarkerHomography = null; // Homography computed from the marker corners
      }
    }
  }

  video.addEventListener("stalled", () => {
    if (currentStream) {
    console.warn("Video stalled, restarting camera...");
    currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
        lastLargestContour = null;
        lastMarkerHomography = null; // Homography computed from the marker corners
    startCamera("environment");
    }
  });
  
  video.addEventListener("error", (e) => {
    if (currentStream) {
    console.error("Video error:", e);
    currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
        lastLargestContour = null;
        lastMarkerHomography = null; // Homography computed from the marker corners
    startCamera("environment");
    }
  });
  
  

function updateDebugLabel(message) {
    const debugLabel = document.getElementById('debug-label');
    debugLabel.textContent = message;
}

document.addEventListener('visibilitychange', () => {
   
    // Only reinitialize the camera if the page is visible and the camera-view is not hidden.
    if (document.visibilityState === 'visible' && !cameraView.classList.contains('hidden')) {
      startCamera("environment");
    }
  });

  let wakeLock = null;

async function requestWakeLock() {
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      console.log('Screen Wake Lock released');
    });
    console.log('Screen Wake Lock active');
  } catch (err) {
    console.error(`Wake Lock error: ${err.name}, ${err.message}`);
  }
}

async function releaseWakeLock() {
  if (wakeLock !== null) {
    await wakeLock.release();
    wakeLock = null;
  }
}
  
  


  
// When the video metadata is loaded, set dimensions for both canvases
async function startCamera(facingMode = "environment") {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }

    try {
        let constraints = {
            video: {
                facingMode: facingMode,
                width: { ideal: window.innerHeight * 3 },
                height: { ideal: window.innerWidth * 3 }
            }
        };
        let stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        currentStream = stream;
        video.onloadedmetadata = () => {
            updateDebugLabel("Video dimensions: " + video.videoWidth + " x " + video.videoHeight);
            video.play();
            
            // Option 2: Set canvas to full window size
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            processingCanvas.width = window.innerWidth;
            processingCanvas.height = window.innerHeight;

            processFrame(); // Start processing

            // Hide splash screen if present
            const splash = document.getElementById("splash-screen");
            if (splash) {
                splash.style.display = "none";
            }
        };
    } catch (err) {
        console.error("Error accessing camera:", err);
    }
}

//startCamera("environment");

// ---------------- Shared Processing Functions ----------------

// Processes the marker on a given OpenCV Mat (from a canvas),
// draws the marker outline and 3D pose, and returns a computed homography.
// Returns null if no marker is detected.
function processMarker(srcMat) {
    // Create an ImageData for AR.Detector from the srcMat.
    let imgData = new ImageData(new Uint8ClampedArray(srcMat.data), srcMat.cols, srcMat.rows);
    let detector = new AR.Detector();
    let markers = detector.detect(imgData);
    
    if (markers.length > 0) {
        let marker = markers[0];
        //updateDebugLabel("Marker detected with ID: " + marker.id);
        let corners = marker.corners;
        
        // Draw marker outline in green.
        for (let i = 0; i < corners.length; i++) {
            let next = (i + 1) % corners.length;
            cv.line(
                srcMat,
                new cv.Point(corners[i].x, corners[i].y),
                new cv.Point(corners[next].x, corners[next].y),
                new cv.Scalar(0, 255, 0, 255),
                2
            );
        }
        
        // Compute homography.
        let modelSize = 127;
        let srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
            corners[0].x, corners[0].y,
            corners[1].x, corners[1].y,
            corners[2].x, corners[2].y,
            corners[3].x, corners[3].y
        ]);
        let dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
            0, 0,
            modelSize, 0,
            modelSize, modelSize,
            0, modelSize
        ]);
        let homography = cv.findHomography(srcPts, dstPts);
        let computedHomography = homography.clone();
        srcPts.delete();
        dstPts.delete();
        homography.delete();
        
        // ----- Optional: 3D Pose Estimation -----
        let objectPoints = cv.matFromArray(4, 1, cv.CV_32FC3, [
            -modelSize / 2, -modelSize / 2, 0,
             modelSize / 2, -modelSize / 2, 0,
             modelSize / 2,  modelSize / 2, 0,
            -modelSize / 2,  modelSize / 2, 0
        ]);
        let imagePoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
            corners[0].x, corners[0].y,
            corners[1].x, corners[1].y,
            corners[2].x, corners[2].y,
            corners[3].x, corners[3].y
        ]);
        let f = canvas.height; // Use visible canvas dimensions for camera intrinsics.
        let cx = canvas.width / 2;
        let cy = canvas.height / 2;
        let cameraMatrix = cv.matFromArray(3, 3, cv.CV_32F, [
            f, 0, cx,
            0, f, cy,
            0, 0, 1
        ]);
        let distCoeffs = cv.Mat.zeros(4, 1, cv.CV_32F);
        let rvec = new cv.Mat();
        let tvec = new cv.Mat();
        let success = cv.solvePnP(objectPoints, imagePoints, cameraMatrix, distCoeffs, rvec, tvec);
        if (success) {
            let axisEndpoints = cv.matFromArray(4, 1, cv.CV_32FC3, [
                0, 0, 0,                // origin
                modelSize, 0, 0,        // x-axis endpoint
                0, modelSize, 0,        // y-axis endpoint
                0, 0, -modelSize        // z-axis endpoint
            ]);
            let projectedPoints = new cv.Mat();
            cv.projectPoints(axisEndpoints, rvec, tvec, cameraMatrix, distCoeffs, projectedPoints);
            let origin2D = new cv.Point(projectedPoints.data32F[0], projectedPoints.data32F[1]);
            let xAxis2D  = new cv.Point(projectedPoints.data32F[2], projectedPoints.data32F[3]);
            let yAxis2D  = new cv.Point(projectedPoints.data32F[4], projectedPoints.data32F[5]);
            let zAxis2D  = new cv.Point(projectedPoints.data32F[6], projectedPoints.data32F[7]);
            cv.line(srcMat, origin2D, xAxis2D, new cv.Scalar(255, 0, 0, 255), 2);
            cv.line(srcMat, origin2D, yAxis2D, new cv.Scalar(0, 255, 0, 255), 2);
            cv.line(srcMat, origin2D, zAxis2D, new cv.Scalar(0, 0, 255, 255), 2);
            axisEndpoints.delete();
            projectedPoints.delete();
        }
        objectPoints.delete();
        imagePoints.delete();
        cameraMatrix.delete();
        distCoeffs.delete();
        rvec.delete();
        tvec.delete();
        
        return computedHomography;
    } else {
        //updateDebugLabel("No marker detected in frame.");
        return null;
    }
}

// Processes the largest contour from a given OpenCV Mat,
// draws it (in magenta) on the Mat, and returns the contour Mat.
// Returns null if no suitable contour is found.
function processLargestContour(srcMat) {
    let gray = new cv.Mat();
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);
    let thresh = new cv.Mat();
    cv.threshold(gray, thresh, threshValue, 255, cv.THRESH_BINARY);
    if (threshInvert){
        cv.bitwise_not(thresh, thresh);
    }
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(thresh, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    
    let largestContour = null;
    let maxArea = 0;
    let centerX = srcMat.cols / 2;
    let centerY = srcMat.rows / 2;
    for (let i = 0; i < contours.size(); i++) {
        let contour = contours.get(i);
        let area = cv.contourArea(contour);
        let moments = cv.moments(contour);
        if (area > maxArea && moments.m00 !== 0) {
            let cX = moments.m10 / moments.m00;
            let cY = moments.m01 / moments.m00;
            if (cv.pointPolygonTest(contour, new cv.Point(centerX, centerY), false) >= 0) {
                maxArea = area;
                largestContour = contour;
            }
        }
    }
    
    // Draw the largest contour in magenta.
    if (largestContour) {
       
        let contourVector = new cv.MatVector();
        contourVector.push_back(largestContour);
        cv.drawContours(srcMat, contourVector, 0, new cv.Scalar(255, 0, 255, 255), 2);
        contourVector.delete();
    }
    
    gray.delete();
    thresh.delete();
    hierarchy.delete();
    
    return largestContour;
}

// Reduce the number of points in the contour using Douglas-Peucker approximation.
function simplifyContour(contour, epsilonFactor = 0.002) {
    let approx = new cv.Mat();
    let arcLen = cv.arcLength(contour, true);
    let epsilon = epsilonFactor * arcLen;
    cv.approxPolyDP(contour, approx, epsilon, true);
    return approx;
}
// ---------------- Live Video Processing ----------------

function processFrame() {
    if (!processing) return;
    
    // Draw the current video frame onto the offscreen processing canvas.
    let pctx = processingCanvas.getContext("2d");
    pctx.drawImage(video, 0, 0, processingCanvas.width, processingCanvas.height);
    
    // Read the frame from processingCanvas into an OpenCV Mat.
    let src = cv.imread(processingCanvas);
    
    // Process the marker: draw outlines, pose estimation, and update homography.
    let newHomography = processMarker(src);
    if (newHomography) {
        if (lastMarkerHomography) { lastMarkerHomography.delete(); }
        lastMarkerHomography = newHomography.clone();
        newHomography.delete();
    }
    
    // Process the largest contour and update the global variable.
    let newContour = processLargestContour(src);
    if (newContour) {
        if (lastLargestContour) { lastLargestContour.delete(); }
        lastLargestContour = newContour.clone();
        // Note: We keep the clone for later use.
    }
    
    // Display the processed frame on the visible canvas.
    cv.imshow("canvas", src);
    
    // Draw crosshairs on the visible canvas.
    let ctx2d = canvas.getContext("2d");
    ctx2d.save();
    ctx2d.globalCompositeOperation = "difference";
    ctx2d.fillStyle = "white";
    let crosshairSize = 60;
    let chCenterX = canvas.width / 2;
    let chCenterY = canvas.height / 2;
    ctx2d.fillRect(chCenterX - crosshairSize / 2, chCenterY - -1, crosshairSize, 2);
    ctx2d.fillRect(chCenterX - 1, chCenterY - crosshairSize / 2, 2, crosshairSize);
    // Draw a left-facing chevron in the top left corner.
    // Define margin and chevron dimensions.
    const chevronX = 30; // left margin
    const chevronY = 30; // top margin
    const chevronWidth = 15; // horizontal size of chevron
    const chevronHeight = 25; // vertical size of chevron
    
    ctx2d.beginPath();
    // Draw a chevron using three points: 
    // top right, middle left, bottom right.
    ctx2d.moveTo(chevronX + chevronWidth, chevronY); // top right of chevron
    ctx2d.lineTo(chevronX, chevronY + chevronHeight / 2); // middle left (the tip)
    ctx2d.lineTo(chevronX + chevronWidth, chevronY + chevronHeight); // bottom right
    ctx2d.lineWidth = 3;
    ctx2d.strokeStyle = "white";
    ctx2d.stroke();
    ctx2d.restore();
    
    src.delete();
    requestAnimationFrame(processFrame);
}

// ---------------- High Resolution Capture Processing ----------------

async function captureProcess(event) {
    event.preventDefault();
    updateDebugLabel("Capture & Process button clicked!");

    // Check that both the marker homography and the stored largest contour are available.
    if (!lastMarkerHomography || !lastLargestContour) {
        updateDebugLabel("Both an ArUco marker and a largest contour must be present.");
       
        return;
    }
   
        try {
            
            
            // Simplify the contour before warping.
            let simplifiedContour = simplifyContour(lastLargestContour, 0.005);
            //newContour.delete();
            if (lastLargestContour) lastLargestContour.delete();
            lastLargestContour = simplifiedContour;
            
            // Compute warped contour points using the updated homography.
           
            let warpedContourData = [];
            let numPoints = lastLargestContour.data32S.length / 2;
            let m = lastMarkerHomography.data64F; // Homography as a flat 3x3 array.
            for (let i = 0; i < numPoints; i++) {
                let x = lastLargestContour.data32S[i * 2];
                let y = lastLargestContour.data32S[i * 2 + 1];
                let denominator = m[6] * x + m[7] * y + m[8];
                let warpedX = (m[0] * x + m[1] * y + m[2]) / denominator;
                let warpedY = (m[3] * x + m[4] * y + m[5]) / denominator;
                warpedContourData.push({ x: warpedX, y: warpedY });
            }
            
            // Send the warped contour data to your pattern processing.
            if (activePatternIndex !== null) {
                project.patterns[activePatternIndex].contourData = warpedContourData;
            }
            renderPatternList();
            activePatternIndex = null;
            document.getElementById('camera-view').classList.add('hidden');
            
            src.delete();
           // newContour.delete();
        } catch (err) {
            updateDebugLabel("Error capturing resolution image: " + err);
        }
    }
    
  

// ---------------- Event Listeners ----------------



const slider = document.getElementById("vertical-slider");
let initialSliderValue = null;
let sliderStartTime = null;

// On start (mousedown/touchstart), record the slider’s initial value and the current time.
slider.addEventListener("mousedown", () => {
  initialSliderValue = parseInt(slider.value, 10);
  sliderStartTime = Date.now();
});
slider.addEventListener("touchstart", () => {
  initialSliderValue = parseInt(slider.value, 10);
  sliderStartTime = Date.now();
});

// Update global thresholds continuously when sliding.
slider.addEventListener("input", (e) => {
  const elapsedTime = Date.now() - sliderStartTime;
    if (elapsedTime < 1000) {
        // Revert slider value to initial
        slider.value = initialSliderValue;
    }
  const currentValue = parseInt(slider.value, 10);
  threshInvert = currentValue < 0 ? true : false;
  threshValue = Math.abs(currentValue);
  
});

// On release, check if less than 1 second has elapsed. If so, revert the slider value.
slider.addEventListener("mouseup", (e) => {
  const elapsedTime = Date.now() - sliderStartTime;
  if (elapsedTime < 1000) {
    // Revert slider value to initial
    slider.value = initialSliderValue;
    // Update global thresholds to match the initial value.
    threshInvert = initialSliderValue < 0 ? true : false;
    threshValue = Math.abs(initialSliderValue);
  }
  captureProcess(e);
});
slider.addEventListener("touchend", (e) => {
  const elapsedTime = Date.now() - sliderStartTime;
  if (elapsedTime < 1000) {
    slider.value = initialSliderValue;
    threshInvert = initialSliderValue < 0 ? true : false;
    threshValue = Math.abs(initialSliderValue);
  }
  captureProcess(e);
});







class Pattern {
    constructor(description = "", width = 0, height = 0, contourData = null) {
      this.description = description;
      this.width = width;
      this.height = height;
      this.contourData = contourData; // This will hold the raw contour data
    }
  }

  

  function renderPatternList() {
    const listContainer = document.getElementById('pattern-list');
    // Remove existing pattern rows (except the "Add Pattern" button)
    listContainer.querySelectorAll('.pattern-row').forEach(el => el.remove());
    
    project.patterns.forEach((pattern, index) => {
      const row = document.createElement('div');
      row.classList.add('pattern-row');
      row.setAttribute('data-index', index);
      
      row.innerHTML = `
      <div id="pattern-preview-container">
      <i class="icon-camera" data-lucide="camera"></i>  
      <canvas class="pattern-preview" width="350" height="200"></canvas>
      <button class="edit-pattern"><i data-lucide="pencil"></i></button>
      
      </div>
      
        <input type="text" class="pattern-description" placeholder="Description" value="${pattern.description}">
        <label>Width</label>
        <input type="number" class="pattern-width" placeholder="Width" value="${pattern.width}">
        <label>Height</label>
        <input type="number" class="pattern-height" placeholder="Height" value="${pattern.height}">
        <div class="row-buttons-container">
        <button class="open-camera-for-pattern"><i data-lucide="camera"></i></button>
        <button class="remove-pattern"><i data-lucide="trash-2"></i></button>
        <button class="move-up"><i data-lucide="chevron-up"></i></button>
        <button class="move-down"><i data-lucide="chevron-down"></i></button>
        </div>
      `;
      
      // Update pattern values on input change
      row.querySelector('.pattern-description').addEventListener('input', e => {
        project.patterns[index].description = e.target.value;
      });
      row.querySelector('.pattern-width').addEventListener('input', e => {
        project.patterns[index].width = parseFloat(e.target.value);
      });
      row.querySelector('.pattern-height').addEventListener('input', e => {
        project.patterns[index].height = parseFloat(e.target.value);
      });

       // Set up the edit button for this pattern
      row.querySelector('.edit-pattern').addEventListener('click', () => {
        activePatternIndex = index;
      });
      
      // Set up the camera button for this pattern
      row.querySelector('.open-camera-for-pattern').addEventListener('click', () => {
        activePatternIndex = index;
        toggleCameraView();
      });
      
      // Remove pattern
      row.querySelector('.remove-pattern').addEventListener('click', () => {
        project.patterns.splice(index, 1);
        renderPatternList();
      });
      
      // Move up/down functionality
      row.querySelector('.move-up').addEventListener('click', () => {
        if (index > 0) {
          [project.patterns[index - 1], project.patterns[index]] = [project.patterns[index], project.patterns[index - 1]];
          renderPatternList();
        }
      });
      row.querySelector('.move-down').addEventListener('click', () => {
        if (index < project.patterns.length - 1) {
          [project.patterns[index + 1], project.patterns[index]] = [project.patterns[index], project.patterns[index + 1]];
          renderPatternList();
        }
      });
      
      // Draw contour preview if available
      const previewCanvas = row.querySelector('.pattern-preview');
      if (pattern.contourData) {
        drawContourOnCanvas(previewCanvas, pattern.contourData);
      } else {
        // Clear canvas or show a placeholder
        const ctx = previewCanvas.getContext("2d");
        ctx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        //ctx.fillStyle = "#fff";
        //ctx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
      }
      
      // Insert the row before the "Add Pattern" button
      listContainer.insertBefore(row, document.getElementById('add-pattern'));
      lucide.createIcons();
    });
  }
  
  document.getElementById('add-pattern').addEventListener('click', () => {
    project.patterns.push(new Pattern());
    renderPatternList();
    lucide.createIcons();
  });
  
  function drawContourOnCanvas(canvas, contourData) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!contourData || contourData.length === 0) return;
    
    // Calculate bounding box of the contour data
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    contourData.forEach(pt => {
      minX = Math.min(minX, pt.x);
      minY = Math.min(minY, pt.y);
      maxX = Math.max(maxX, pt.x);
      maxY = Math.max(maxY, pt.y);
    });
    
    const contourWidth = maxX - minX;
    const contourHeight = maxY - minY;
    
    // Determine scale to fit the canvas dimensions
    const scaleX = canvas.width / contourWidth;
    const scaleY = canvas.height / contourHeight;
    const scale = Math.min(scaleX, scaleY);
    
    // Calculate offsets to center the drawing
    const offsetX = (canvas.width - contourWidth * scale) / 2;
    const offsetY = (canvas.height - contourHeight * scale) / 2;
    
    // Begin drawing the contour path
    ctx.beginPath();
    const firstPoint = contourData[0];
    ctx.moveTo((firstPoint.x - minX) * scale + offsetX, (firstPoint.y - minY) * scale + offsetY);
    for (let i = 1; i < contourData.length; i++) {
      const pt = contourData[i];
      ctx.lineTo((pt.x - minX) * scale + offsetX, (pt.y - minY) * scale + offsetY);
    }
    ctx.closePath();
    ctx.strokeStyle = "black";
    ctx.lineWidth = 1;
    ctx.stroke();


  }
  
  
  
  
  
  


  //document.getElementById('capture-process').addEventListener('click', () => {
    // Implement your function to convert contours to a simple data format
    // For instance, convertContoursToData() might return an array of points.
   // const contourData = convertContoursToData(); 
    
    // Save the contour data to the active pattern
   // if (activePatternIndex !== null) {
   //   project.patterns[activePatternIndex].contourData = contourData;
   //   renderPatternList();
   //   activePatternIndex = null;
   // }
    
    // Hide the camera view
  //  document.getElementById('camera-view').classList.add('hidden');
 // });
  
    
