import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  AfterViewInit,
  ChangeDetectorRef,
} from '@angular/core';
import { Camera } from '@mediapipe/camera_utils';
import { Pose, POSE_CONNECTIONS, Results } from '@mediapipe/pose';
import Papa from 'papaparse';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})

export class AppComponent implements OnInit, AfterViewInit {
  @ViewChild('videoElement') videoElement!: ElementRef;
  @ViewChild('cameraElement') cameraElement!: ElementRef;
  @ViewChild('canvasElement1') canvasElement1!: ElementRef;
  @ViewChild('canvasElement2') canvasElement2!: ElementRef;
  private videoPose!: Pose;
  private cameraPose!: Pose;
  private camera!: Camera;
  leftMatching = false;
  rightMatching = false;
  public minVideoAngle: { [key: string]: number } = {
    leftWrist: Infinity,
    rightWrist: Infinity,
  };
  public maxVideoAngle: { [key: string]: number } = {
    leftWrist: -Infinity,
    rightWrist: -Infinity,
  };
  public cameraAngle: { [key: string]: number } = {
    leftWrist: Infinity,
    rightWrist: Infinity,
  };
  public videoAngle: { [key: string]: number } = {
    leftWrist: Infinity,
    rightWrist: Infinity,
  };
  public minCameraAngle: { [key: string]: number } = {
    leftWrist: Infinity,
    rightWrist: Infinity,
  };
  public maxCameraAngle: { [key: string]: number } = {
    leftWrist: -Infinity,
    rightWrist: -Infinity,
  };
  private csvData: any[] = [];
  private currentFrameIndex: number = 0;
  private matchingVideoData: { timestamp: string; 'LSA Deg': string; 'RSA Deg': string; }[] = [];
  private matchingCameraData: { timestamp: string; 'LSA Deg': string; 'RSA Deg': string; }[] = [];
  private startTime: number = 0;
  constructor(private cdr: ChangeDetectorRef) { }

  ngOnInit(): void {
    console.log('PoseComparisonComponent initialized');
    // this.initializePoseModels();
    // this.initializeCamera();
    // this.loadCSVFromPath('assets/pose_metadata.csv');
  }

  private saveToCSV(matchingData: any[], csvName: string) {
    const csv = Papa.unparse(matchingData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = csvName;
    link.click();
  }

  getCoordinatesForFrame(frameIndex: number) {
    if (frameIndex >= this.csvData.length) return null;

    const frameData = this.csvData.filter(row => row[0] === frameIndex);

    // Extract coordinates for each landmark
    const leftShoulder = frameData.find(row => row[2] === 'LEFT_SHOULDER');
    const rightShoulder = frameData.find(row => row[2] === 'RIGHT_SHOULDER');
    const leftWrist = frameData.find(row => row[2] === 'LEFT_WRIST');
    const rightWrist = frameData.find(row => row[2] === 'RIGHT_WRIST');

    // Return coordinates in the required format
    return {
      leftShoulder: leftShoulder ? { x: leftShoulder[3], y: leftShoulder[4], z: leftShoulder[5] } : null,
      rightShoulder: rightShoulder ? { x: rightShoulder[3], y: rightShoulder[4], z: rightShoulder[5] } : null,
      leftWrist: leftWrist ? { x: leftWrist[3], y: leftWrist[4], z: leftWrist[5] } : null,
      rightWrist: rightWrist ? { x: rightWrist[3], y: rightWrist[4], z: rightWrist[5] } : null,
    };
  }

  ngAfterViewInit(): void {
    this.initializePoseModels();
    this.initializeCamera();

    if (!this.startTime) {
      this.startTime = new Date().getTime(); // Save the initial timestamp
    }
  }

  private recordMatch(angle: number, wrist: string, status: string, angleType: 'min' | 'max' | '90-degree') {
    // Retrieve existing data from localStorage
    const timestamp = new Date().toISOString();
    const currentTimestamp = new Date().getTime();
    let existingData = JSON.parse(localStorage.getItem('matchingData') || '[]');

    // Check if there's already an entry for the given wrist and angleType
    const existingEntry = existingData.find(
      (entry: any) => {
        const entryTimestamp = new Date(entry.timestamp).getTime();
        return (
          Math.abs(entryTimestamp - currentTimestamp) <= 2000 &&
          entry.wrist === wrist &&
          entry.angleType === angleType
        );
      }
    );

    if (!existingEntry) {
      // Save the new match only if it hasn't been saved yet
      const newEntry = { timestamp, wrist, status, angleType, angle };
      existingData.push(newEntry);

      // Save updated data back to localStorage
      localStorage.setItem('matchingData', JSON.stringify(existingData));
    }

    if (angleType === '90-degree' && Math.abs(angle - 90) <= 1) { // ±1 degree tolerance
      const ninetyDegreeEntry = existingData.find(
        (entry: any) => {
          const entryTimestamp = new Date(entry.timestamp).getTime();
          return (
            Math.abs(entryTimestamp - currentTimestamp) <= 2000 &&
            entry.wrist === wrist &&
            entry.angleType === angleType
          );
        }
      );

      if (!ninetyDegreeEntry) {
        const timestamp = new Date().toISOString();
        const newEntry = { timestamp, wrist, status, angleType, angle };
        existingData.push(newEntry);

        // Save updated data back to localStorage
        localStorage.setItem('matchingData', JSON.stringify(existingData));
      }
    }
  }

  generateCSV() {
    const getMinMax = (data: any[], key: string) => {
      const min = data.reduce((prev, curr) =>
        parseFloat(curr[key]) < parseFloat(prev[key]) ? curr : prev
      );
      const max = data.reduce((prev, curr) =>
        parseFloat(curr[key]) > parseFloat(prev[key]) ? curr : prev
      );
      return { min, max };
    };

    const { min: minVideoLSA, max: maxVideoLSA } = getMinMax(this.matchingVideoData, 'LSA Deg');
    const { min: minVideoRSA, max: maxVideoRSA } = getMinMax(this.matchingVideoData, 'RSA Deg');

    const { min: minCameraLSA, max: maxCameraLSA } = getMinMax(this.matchingCameraData, 'LSA Deg');
    const { min: minCameraRSA, max: maxCameraRSA } = getMinMax(this.matchingCameraData, 'RSA Deg');

    const blankRow = { timestamp: '', 'LSA Deg': '', 'RSA Deg': '', Type: '' };
    // this.matchingVideoData.push(blankRow, blankRow, blankRow, blankRow);
    // this.matchingCameraData.push(blankRow, blankRow, blankRow, blankRow);

    // this.matchingVideoData.push(
    //   { timestamp: minVideoLSA.timestamp, 'LSA Deg': minVideoLSA['LSA Deg'], 'RSA Deg': minVideoRSA['RSA Deg'] },
    //   { timestamp: maxVideoRSA.timestamp, 'LSA Deg': maxVideoLSA['LSA Deg'], 'RSA Deg': maxVideoRSA['RSA Deg'] },
    // )
    // this.matchingCameraData.push(
    //   { timestamp: minCameraLSA.timestamp, 'LSA Deg': minCameraLSA['LSA Deg'], 'RSA Deg': minCameraRSA['RSA Deg'] },
    //   { timestamp: maxCameraRSA.timestamp, 'LSA Deg': maxCameraLSA['LSA Deg'], 'RSA Deg': maxCameraRSA['RSA Deg'] },
    // )
    this.saveToCSV(this.matchingVideoData, 'video_matching_data.csv');
    this.saveToCSV(this.matchingCameraData, 'camera_matching_data.csv');

    const matchingClipData = this.getClipPatientData(this.matchingVideoData);
    const matchingPatientData = this.getClipPatientData(this.matchingCameraData);
    console.log('matchingClipData', matchingClipData);
    console.log('matchingPatientData', matchingPatientData);

    // const matchingData = this.calculateAllMinMaxComparisons(this.matchingVideoData, this.matchingCameraData);
    // // this.saveComparisonToCSV(matchingData);
    this.saveToCSV(matchingClipData.matchingData, 'clip_min_max_matches.csv');
    this.saveToCSV(matchingPatientData.matchingData, 'patient_min_max_matches.csv');

    const results = this.matchClipAndPatientData(matchingClipData.matchingData, matchingPatientData.matchingData);
    this.saveToCSV(results, 'min_max_matches.csv');
  }

  matchClipAndPatientData(matchingClipData: any[], matchingPatientData: any[]) {
    const results: any = [];
    const timeThreshold = 3; // Time difference threshold (seconds)
    const angleThreshold = 5; // Angle difference threshold

    // Loop through clip and patient data to find matches
    matchingClipData.forEach((clipEntry) => {
      const closestPatient = matchingPatientData.reduce(
        (closest, patientEntry) => {
          const timeDiff = Math.abs(+clipEntry.timestamp - +patientEntry.timestamp);
          const angleDiff = Math.abs(clipEntry.Deg - patientEntry.Deg);

          if (!closest || timeDiff < closest.timeDiff || (timeDiff === closest.timeDiff && angleDiff < closest.angleDiff)) {
            return { patientEntry, timeDiff, angleDiff };
          }
          return closest;
        },
        null
      );

      const isGood =
        closestPatient &&
        closestPatient.timeDiff <= timeThreshold &&
        closestPatient.angleDiff <= angleThreshold;

      // Store the comparison data
      results.push({
        ClipMinMax: clipEntry["Min/Max"],
        ClipTimestamp: clipEntry.timestamp,
        ClipDeg: clipEntry.Deg,
        PatientMinMax: closestPatient?.patientEntry["Min/Max"],
        PatientTimestamp: closestPatient?.patientEntry.timestamp,
        PatientDeg: closestPatient?.patientEntry.Deg,
        Comments: isGood ? "Good" : "Not Good",
      });
    });

    return results;
  }

  getClipPatientData(data: any) {
    let minLSA = Infinity;
    let maxLSA = -Infinity;
    let minRSA = Infinity;
    let maxRSA = -Infinity;

    // Identify the min and max values for LSA and RSA
    data.forEach((entry: any) => {
      if (+entry['LSA Deg'] < minLSA) minLSA = entry['LSA Deg'] > 3 ? entry['LSA Deg'] : 3;
      if (+entry['LSA Deg'] > maxLSA) maxLSA = entry['LSA Deg'];
      if (+entry['RSA Deg'] < minRSA) minRSA = entry['RSA Deg'] > 3 ? entry['RSA Deg'] : 3;
      if (+entry['RSA Deg'] > maxRSA) maxRSA = entry['RSA Deg'];
    });

    // Define thresholds
    const threshold = 4;
    const timeThreshold = 8; // in seconds

    // Initialize tracking variables for timestamps
    const lastTimestamps = {
      minLSA: 0,
      maxLSA: 0,
      minRSA: 0,
      maxRSA: 0,
    };

    // Store nearby values
    const nearbyValues: any = {
      minLSA: [],
      maxLSA: [],
      minRSA: [],
      maxRSA: [],
    };
    const matchingData: any = [];

    // Reusable function to check and push values
    function checkAndPush(
      entry: any,
      key: 'minLSA' | 'maxLSA' | 'minRSA' | 'maxRSA',
      targetValue: number,
      valueKey: string
    ) {
      if (Math.abs(entry[valueKey] - targetValue) <= threshold) {
        const lastTimestamp = lastTimestamps[key];
        const currentTimestamp = +entry.timestamp;

        if (!lastTimestamp || (currentTimestamp - lastTimestamp) >= timeThreshold) {
          // Push the value if time gap condition is met
          nearbyValues[key].push({ timestamp: entry.timestamp, [valueKey]: entry[valueKey] });
          lastTimestamps[key] = currentTimestamp; // Update last timestamp
          if (valueKey.indexOf('RSA') > -1)
            matchingData.push({ 'Min/Max': key.indexOf('min') > -1 ? 'Min Value' : 'Max Value', timestamp: entry.timestamp, Deg: entry[valueKey] });
        }
      }
    }

    // Iterate over the dataset
    data.forEach((entry: any) => {
      // Check nearby values for min and max LSA
      checkAndPush(entry, 'minLSA', minLSA, 'LSA Deg');
      checkAndPush(entry, 'maxLSA', maxLSA, 'LSA Deg');

      // Check nearby values for min and max RSA
      checkAndPush(entry, 'minRSA', minRSA, 'RSA Deg');
      checkAndPush(entry, 'maxRSA', maxRSA, 'RSA Deg');
    });

    return {
      minLSA,
      maxLSA,
      minRSA,
      maxRSA,
      nearbyValues,
      matchingData
    };
  }

  calculateAllMinMaxComparisons(clipData: any, patientData: any) {
    const results: any = [];

    // Helper function to find all min and max points
    const getAllMinMaxPoints = (data: any, key: any) => {
      const sortedData = [...data].sort((a, b) => a[key] - b[key]);
      const minPoints = sortedData.filter((point) => point[key] === sortedData[0][key]);
      const maxPoints = sortedData.filter((point) => point[key] === sortedData[sortedData.length - 1][key]);
      return { minPoints, maxPoints };
    };

    // Find all min and max for Clip and Patient
    const clipMinMax = getAllMinMaxPoints(clipData, 'RSA Deg');
    const patientMinMax = getAllMinMaxPoints(patientData, 'RSA Deg');

    // Compare each Clip min/max with Patient min/max
    const comparePoints = (clipPoints, patientPoints, type) => {
      clipPoints.forEach((clipPoint) => {
        let closestMatch: any = null;
        let smallestTimeDiff = Infinity;

        // Find the closest patient point
        patientPoints.forEach((patientPoint) => {
          const timeDiff = Math.abs(clipPoint.timestamp - patientPoint.timestamp);
          if (timeDiff < smallestTimeDiff) {
            closestMatch = patientPoint;
            smallestTimeDiff = timeDiff;
          }
        });

        // Add result with comment
        results.push({
          Type: type,
          'Clip Time': clipPoint.timestamp,
          'Clip SA Deg': clipPoint['RSA Deg'],
          'Patient Time': closestMatch?.timestamp,
          'Patient SA Deg': closestMatch?.['RSA Deg'],
          Comment: smallestTimeDiff <= 1 ? 'Good' : 'Not Good',
        });
      });
    };

    // Process min and max points
    comparePoints(clipMinMax.minPoints, patientMinMax.minPoints, 'Min');
    comparePoints(clipMinMax.maxPoints, patientMinMax.maxPoints, 'Max');

    return results;
  };

  saveComparisonToCSV(comparisonResults) {
    const csvData: any = [];

    // Add Clip Min/Max
    csvData.push(
      { Type: 'Clip Min LSA', ...comparisonResults.clipMinLSA },
      { Type: 'Clip Max LSA', ...comparisonResults.clipMaxLSA },
      { Type: 'Clip Min RSA', ...comparisonResults.clipMinRSA },
      { Type: 'Clip Max RSA', ...comparisonResults.clipMaxRSA },
      {}
    );

    // Add Patient Min/Max for each Clip Min/Max
    csvData.push(
      { Type: 'Patient Min for Clip Min LSA', ...comparisonResults.patientMinMaxForClipMinLSA?.patientMinLSA },
      { Type: 'Patient Max for Clip Min LSA', ...comparisonResults.patientMinMaxForClipMinLSA?.patientMaxLSA },
      { Type: 'Patient Min for Clip Max LSA', ...comparisonResults.patientMinMaxForClipMaxLSA?.patientMinLSA },
      { Type: 'Patient Max for Clip Max LSA', ...comparisonResults.patientMinMaxForClipMaxLSA?.patientMaxLSA },
      { Type: 'Patient Min for Clip Min RSA', ...comparisonResults.patientMinMaxForClipMinRSA?.patientMinRSA },
      { Type: 'Patient Max for Clip Min RSA', ...comparisonResults.patientMinMaxForClipMinRSA?.patientMaxRSA },
      { Type: 'Patient Min for Clip Max RSA', ...comparisonResults.patientMinMaxForClipMaxRSA?.patientMinRSA },
      { Type: 'Patient Max for Clip Max RSA', ...comparisonResults.patientMinMaxForClipMaxRSA?.patientMaxRSA }
    );

    this.saveToCSV(csvData, 'clip_patient_comparison.csv');
  }

  private initializePoseModels() {
    this.videoPose = new Pose({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });
    this.cameraPose = new Pose({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`,
    });

    const poseOptions: any = {
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    };
    this.videoPose.setOptions(poseOptions);
    this.cameraPose.setOptions(poseOptions);

    this.videoPose.onResults((results: Results) => {
      this.onPoseVideoResults(results, this.canvasElement1.nativeElement);
    });
    this.cameraPose.onResults((results: Results) => {
      this.onPoseCameraResults(results, this.canvasElement2.nativeElement);
    });

    this.videoElement.nativeElement.onloadeddata = () => {
      this.processVideoFrames();
    };
  }

  private async processVideoFrames() {
    const video = this.videoElement.nativeElement;
    const renderFrame = async () => {
      if (video.paused || video.ended) return;
      await this.videoPose.send({ image: video });
      requestAnimationFrame(renderFrame);
    };
    renderFrame();
  }

  private initializeCamera() {
    this.camera = new Camera(this.cameraElement.nativeElement, {
      onFrame: async () => {
        await this.cameraPose.send({ image: this.cameraElement.nativeElement });
      },
      width: 640,
      height: 480,
    });
    this.camera.start();
  }

  private calculateAngleBetweenPoints(
    A: { x: number; y: number; z: number },
    B: { x: number; y: number; z: number }
  ): number {
    const vectorAB = { x: B.x - A.x, y: B.y - A.y };
    const verticalVector = { x: 0, y: 1 };

    const dotProduct =
      vectorAB.x * verticalVector.x + vectorAB.y * verticalVector.y;

    const magnitudeAB = Math.sqrt(vectorAB.x ** 2 + vectorAB.y ** 2);
    const magnitudeVertical = Math.sqrt(
      verticalVector.x ** 2 + verticalVector.y ** 2
    );

    const angleInRadians = Math.acos(
      dotProduct / (magnitudeAB * magnitudeVertical)
    );
    return angleInRadians * (180 / Math.PI);
  }

  private onPoseVideoResults(
    results: Results,
    canvasElement: HTMLCanvasElement
  ) {
    const canvasCtx = canvasElement.getContext('2d');
    if (canvasCtx) {
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      canvasCtx.drawImage(
        results.image,
        0,
        0,
        canvasElement.width,
        canvasElement.height
      );

      if (results.poseLandmarks) {
        const leftShoulder = results.poseLandmarks[11];
        const leftWrist = results.poseLandmarks[15];
        const rightShoulder = results.poseLandmarks[12];
        const rightWrist = results.poseLandmarks[16];

        // const frameData = this.getCoordinatesForFrame(this.currentFrameIndex);

        // if (!frameData) return; // No data for the frame

        // const { leftShoulder, leftWrist, rightShoulder, rightWrist } = frameData;

        // const leftAngle = this.calculateAngleBetweenPoints(leftShoulder, leftWrist);
        // const rightAngle = this.calculateAngleBetweenPoints(rightShoulder, rightWrist);
        // Calculate angles for left and right wrists
        const leftAngle = this.calculateAngleBetweenPoints(
          { x: leftShoulder.x, y: leftShoulder.y, z: leftShoulder.z },
          { x: leftWrist.x, y: leftWrist.y, z: leftWrist.z }
        );

        const rightAngle = this.calculateAngleBetweenPoints(
          { x: rightShoulder.x, y: rightShoulder.y, z: rightShoulder.z },
          { x: rightWrist.x, y: rightWrist.y, z: rightWrist.z }
        );
        const elapsedTime = ((new Date().getTime() - this.startTime) / 1000).toFixed(3);
        this.matchingVideoData.push({
          timestamp: `${elapsedTime}`,
          'LSA Deg': `${Math.round(leftAngle)}`,
          'RSA Deg': `${Math.round(rightAngle)}`
        });

        // Update min and max only if source is video
        if (leftAngle < this.minVideoAngle['leftWrist'])
          this.minVideoAngle['leftWrist'] = leftAngle;
        if (leftAngle > this.maxVideoAngle['leftWrist'])
          this.maxVideoAngle['leftWrist'] = leftAngle;
        if (rightAngle < this.minVideoAngle['rightWrist'])
          this.minVideoAngle['rightWrist'] = rightAngle;
        if (rightAngle > this.maxVideoAngle['rightWrist'])
          this.maxVideoAngle['rightWrist'] = rightAngle;
        this.videoAngle['leftWrist'] = leftAngle;
        this.videoAngle['rightWrist'] = rightAngle;
        const tolerance = 3;

        if (Math.abs(leftAngle - 90) <= 1) {
          this.recordMatch(leftAngle, 'leftWrist', 'Matched at 90 degrees', '90-degree');
        }

        if (Math.abs(rightAngle - 90) <= 1) {
          this.recordMatch(rightAngle, 'rightWrist', 'Matched at 90 degrees', '90-degree');
        }

        const withinTolerance = (
          angle: number,
          target: number,
          tolerance: number
        ) => angle >= target - tolerance && angle <= target + tolerance;

        if (
          withinTolerance(leftAngle, this.minVideoAngle['leftWrist'], tolerance)
        ) {
          this.leftMatching = withinTolerance(
            this.cameraAngle['leftWrist'],
            this.minVideoAngle['leftWrist'],
            tolerance
          );
          if (this.leftMatching) {
            this.recordMatch(leftAngle, 'leftWrist', 'Left Wrist is matching the video angle', 'min');
          }
        }

        if (
          withinTolerance(leftAngle, this.maxVideoAngle['leftWrist'], tolerance)
        ) {
          this.leftMatching = withinTolerance(
            this.cameraAngle['leftWrist'],
            this.maxVideoAngle['leftWrist'],
            tolerance
          );
          if (this.leftMatching) {
            this.recordMatch(leftAngle, 'leftWrist', 'Left Wrist is matching the video angle', 'max');
          }
        }

        if (
          withinTolerance(
            rightAngle,
            this.minVideoAngle['rightWrist'],
            tolerance
          )
        ) {
          this.rightMatching = withinTolerance(
            this.cameraAngle['rightWrist'],
            this.minVideoAngle['rightWrist'],
            tolerance
          );
          if (this.rightMatching) {
            this.recordMatch(rightAngle, 'rightWrist', 'Right Wrist is matching the video angle', 'min');
          }
        }

        if (
          withinTolerance(
            rightAngle,
            this.maxVideoAngle['rightWrist'],
            tolerance
          )
        ) {
          this.rightMatching = withinTolerance(
            this.cameraAngle['rightWrist'],
            this.maxVideoAngle['rightWrist'],
            tolerance
          );
          if (this.rightMatching) {
            this.recordMatch(rightAngle, 'rightWrist', 'Right Wrist is matching the video angle', 'max');
          }
        }

        this.cdr.detectChanges();

        // Additional code to draw pose landmarks and connections on the canvas
        results.poseLandmarks.forEach((landmark) => {
          canvasCtx.beginPath();
          canvasCtx.arc(
            landmark.x * canvasElement.width,
            landmark.y * canvasElement.height,
            5,
            0,
            2 * Math.PI
          );
          canvasCtx.fillStyle = 'rgba(255, 0, 0, 0.6)';
          canvasCtx.fill();
        });

        POSE_CONNECTIONS.forEach(([start, end]) => {
          const startLandmark = results.poseLandmarks[start];
          const endLandmark = results.poseLandmarks[end];
          canvasCtx.beginPath();
          canvasCtx.moveTo(
            startLandmark.x * canvasElement.width,
            startLandmark.y * canvasElement.height
          );
          canvasCtx.lineTo(
            endLandmark.x * canvasElement.width,
            endLandmark.y * canvasElement.height
          );
          canvasCtx.lineWidth = 2;
          canvasCtx.strokeStyle = 'rgba(0, 255, 0, 0.6)';
          canvasCtx.stroke();
        });
      }
    }
  }

  private onPoseCameraResults(
    results: Results,
    canvasElement: HTMLCanvasElement
  ) {
    const canvasCtx = canvasElement.getContext('2d');
    if (canvasCtx) {
      canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
      canvasCtx.drawImage(
        results.image,
        0,
        0,
        canvasElement.width,
        canvasElement.height
      );

      if (results.poseLandmarks) {
        const leftShoulder = results.poseLandmarks[11];
        const leftWrist = results.poseLandmarks[15];
        const rightShoulder = results.poseLandmarks[12];
        const rightWrist = results.poseLandmarks[16];

        // Calculate angles for left and right wrists
        const leftAngle = this.calculateAngleBetweenPoints(
          { x: leftShoulder.x, y: leftShoulder.y, z: leftShoulder.z },
          { x: leftWrist.x, y: leftWrist.y, z: leftWrist.z }
        );

        const rightAngle = this.calculateAngleBetweenPoints(
          { x: rightShoulder.x, y: rightShoulder.y, z: rightShoulder.z },
          { x: rightWrist.x, y: rightWrist.y, z: rightWrist.z }
        );

        this.cameraAngle['leftWrist'] = leftAngle;
        this.cameraAngle['rightWrist'] = rightAngle;

        const elapsedTime = ((new Date().getTime() - this.startTime) / 1000).toFixed(3);
        this.matchingCameraData.push({
          timestamp: `${elapsedTime}`,
          'LSA Deg': `${Math.round(leftAngle)}`,
          'RSA Deg': `${Math.round(rightAngle)}`
        });
        this.cdr.detectChanges();

        // Additional code to draw pose landmarks and connections on the canvas
        results.poseLandmarks.forEach((landmark) => {
          canvasCtx.beginPath();
          canvasCtx.arc(
            landmark.x * canvasElement.width,
            landmark.y * canvasElement.height,
            5,
            0,
            2 * Math.PI
          );
          canvasCtx.fillStyle = 'rgba(255, 0, 0, 0.6)';
          canvasCtx.fill();
        });

        POSE_CONNECTIONS.forEach(([start, end]) => {
          const startLandmark = results.poseLandmarks[start];
          const endLandmark = results.poseLandmarks[end];
          canvasCtx.beginPath();
          canvasCtx.moveTo(
            startLandmark.x * canvasElement.width,
            startLandmark.y * canvasElement.height
          );
          canvasCtx.lineTo(
            endLandmark.x * canvasElement.width,
            endLandmark.y * canvasElement.height
          );
          canvasCtx.lineWidth = 2;
          canvasCtx.strokeStyle = 'rgba(0, 255, 0, 0.6)';
          canvasCtx.stroke();
        });
      }
    }
  }
}
