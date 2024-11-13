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
  private angleCalculationInterval = 5000; // 5 seconds
  private lastCalculationTime = 0;
  private lastYPositions: { [key: string]: number[] } = {
    leftWrist: [],
    rightWrist: [],
  };
  leftMatching = false;
  rightMatching = false;
  private peakDetectionThreshold = 0.01;
  private lastAngles: { [key: string]: number[] } = {
    leftWrist: [],
    rightWrist: [],
  };
  private peakLogged: { [key: string]: boolean } = {
    leftWrist: false,
    rightWrist: false,
  };
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
  public minCameraAngle: { [key: string]: number } = {
    leftWrist: Infinity,
    rightWrist: Infinity,
  };
  public maxCameraAngle: { [key: string]: number } = {
    leftWrist: -Infinity,
    rightWrist: -Infinity,
  };

  constructor(private cdr: ChangeDetectorRef) { }

  ngOnInit(): void {
    console.log('PoseComparisonComponent initialized');
    // this.initializePoseModels();
    // this.initializeCamera();
  }

  ngAfterViewInit(): void {
    this.initializePoseModels();
    this.initializeCamera();
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

  calculateAngle(landmarkA: any, landmarkB: any, landmarkC: any): number {
    // Vector AB (from A to B)
    const ABx = landmarkB.x - landmarkA.x;
    const ABy = landmarkB.y - landmarkA.y;
    const ABz = landmarkB.z - landmarkA.z;

    // Vector AC (from A to C)
    const ACx = landmarkC.x - landmarkA.x;
    const ACy = landmarkC.y - landmarkA.y;
    const ACz = landmarkC.z - landmarkA.z;

    // Dot product of AB and AC
    const dotProduct = ABx * ACx + ABy * ACy + ABz * ACz;

    // Magnitude of vectors AB and AC
    const magnitudeAB = Math.sqrt(ABx * ABx + ABy * ABy + ABz * ABz);
    const magnitudeAC = Math.sqrt(ACx * ACx + ACy * ACy + ACz * ACz);

    // Calculate the angle in radians and convert to degrees
    const angleRad = Math.acos(dotProduct / (magnitudeAB * magnitudeAC));
    return (angleRad * 180) / Math.PI; // Convert to degrees
  }

  // private calculateAngleBetweenPoints(
  //   A: { x: number; y: number },
  //   B: { x: number; y: number }
  // ): number {
  //   const vectorAB = { x: B.x - A.x, y: B.y - A.y };
  //   const verticalVector = { x: 0, y: 1 };

  //   const dotProduct =
  //     vectorAB.x * verticalVector.x + vectorAB.y * verticalVector.y;
  //   const magnitudeAB = Math.sqrt(vectorAB.x ** 2 + vectorAB.y ** 2);

  //   const angleInRadians = Math.acos(dotProduct / magnitudeAB);
  //   return angleInRadians * (180 / Math.PI);
  // }

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

        // Calculate angles for left and right wrists
        const leftAngle = this.calculateAngleBetweenPoints(
          { x: leftShoulder.x, y: leftShoulder.y, z: leftShoulder.z },
          { x: leftWrist.x, y: leftWrist.y, z: leftWrist.z }
        );

        const rightAngle = this.calculateAngleBetweenPoints(
          { x: rightShoulder.x, y: rightShoulder.y, z: rightShoulder.z },
          { x: rightWrist.x, y: rightWrist.y, z: rightWrist.z }
        );

        // Update min and max only if source is video
        if (leftAngle < this.minVideoAngle['leftWrist'])
          this.minVideoAngle['leftWrist'] = leftAngle;
        if (leftAngle > this.maxVideoAngle['leftWrist'])
          this.maxVideoAngle['leftWrist'] = leftAngle;
        if (rightAngle < this.minVideoAngle['rightWrist'])
          this.minVideoAngle['rightWrist'] = rightAngle;
        if (rightAngle > this.maxVideoAngle['rightWrist'])
          this.maxVideoAngle['rightWrist'] = rightAngle;

        const tolerance = 3;
        // if (leftAngle < this.minVideoAngle['leftWrist'] + tolerance) {
        //   if (
        //     this.cameraAngle['leftWrist'] <=
        //     this.minVideoAngle['leftWrist'] + tolerance
        //   ) {
        //     this.leftMatching = 'Left Wrist is matching the video angle';
        //   } else {
        //     this.leftMatching = 'Left Wrist is not matching the video angle';
        //   }
        // }
        // if (leftAngle > this.maxVideoAngle['leftWrist'] - tolerance) {
        //   if (
        //     this.cameraAngle['leftWrist'] >=
        //     this.maxVideoAngle['leftWrist'] - tolerance
        //   ) {
        //     this.leftMatching = 'Left Wrist is matching the video angle';
        //   } else {
        //     this.leftMatching = 'Left Wrist is not matching the video angle';
        //   }
        // }
        // if (rightAngle < this.minVideoAngle['rightWrist'] + tolerance) {
        //   if (
        //     this.cameraAngle['rightWrist'] <=
        //     this.minVideoAngle['rightWrist'] + tolerance
        //   ) {
        //     this.rightMatching = 'Right Wrist is matching the video angle';
        //   } else {
        //     this.rightMatching = 'Right Wrist is not matching the video angle';
        //   }
        // }
        // if (rightAngle > this.maxVideoAngle['rightWrist'] - tolerance) {
        //   if (
        //     this.cameraAngle['rightWrist'] >=
        //     this.maxVideoAngle['rightWrist'] - tolerance
        //   ) {
        //     this.rightMatching = 'Right Wrist is matching the video angle';
        //   } else {
        //     this.rightMatching = 'Right Wrist is not matching the video angle';
        //   }
        // }
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
        }

        if (
          withinTolerance(leftAngle, this.maxVideoAngle['leftWrist'], tolerance)
        ) {
          this.leftMatching = withinTolerance(
            this.cameraAngle['leftWrist'],
            this.maxVideoAngle['leftWrist'],
            tolerance
          );
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
        }

        this.cdr.detectChanges();
        // If source is camera, compare live angles with recorded min and max
        // if (source === 'camera') {
        //   if (
        //     leftAngle < this.minVideoAngle['leftWrist'] ||
        //     leftAngle > this.maxVideoAngle['leftWrist']
        //   ) {
        //     console.log(`Left wrist angle out of range: ${leftAngle} degrees`);
        //   }
        //   if (
        //     rightAngle < this.minVideoAngle['rightWrist'] ||
        //     rightAngle > this.maxVideoAngle['rightWrist']
        //   ) {
        //     console.log(
        //       `Right wrist angle out of range: ${rightAngle} degrees`
        //     );
        //   }
        // }

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
        console.log(leftShoulder);

        // Calculate angles for left and right wrists
        const leftAngle = this.calculateAngleBetweenPoints(
          { x: leftShoulder.x, y: leftShoulder.y, z: leftShoulder.z },
          { x: leftWrist.x, y: leftWrist.y, z: leftWrist.z }
        );

        const rightAngle = this.calculateAngleBetweenPoints(
          { x: rightShoulder.x, y: rightShoulder.y, z: rightShoulder.z },
          { x: rightWrist.x, y: rightWrist.y, z: rightWrist.z }
        );

        // Update min and max only if source is video
        // this.minCameraAngle['leftWrist'] = Math.min(
        //   this.minCameraAngle['leftWrist'] || leftAngle,
        //   leftAngle
        // );
        // this.maxCameraAngle['leftWrist'] = Math.max(
        //   this.maxCameraAngle['leftWrist'] || leftAngle,
        //   leftAngle
        // );

        // this.minCameraAngle['rightWrist'] = Math.min(
        //   this.minCameraAngle['rightWrist'] || rightAngle,
        //   rightAngle
        // );
        // this.maxCameraAngle['rightWrist'] = Math.max(
        //   this.maxCameraAngle['rightWrist'] || rightAngle,
        //   rightAngle
        // );
        this.cameraAngle['leftWrist'] = leftAngle;
        this.cameraAngle['rightWrist'] = rightAngle;

        // console.log(
        //   `Left wrist camera angle: ${this.minCameraAngle['leftWrist']} to ${this.maxCameraAngle['leftWrist']} degrees`
        // );
        // console.log(
        //   `Right wrist camera angle: ${this.minCameraAngle['rightWrist']} to ${this.maxCameraAngle['rightWrist']} degrees`
        // );
        this.cdr.detectChanges();

        // If source is camera, compare live angles with recorded min and max
        // if (source === 'camera') {
        //   if (
        //     leftAngle < this.minVideoAngle['leftWrist'] ||
        //     leftAngle > this.maxVideoAngle['leftWrist']
        //   ) {
        //     console.log(`Left wrist angle out of range: ${leftAngle} degrees`);
        //   }
        //   if (
        //     rightAngle < this.minVideoAngle['rightWrist'] ||
        //     rightAngle > this.maxVideoAngle['rightWrist']
        //   ) {
        //     console.log(
        //       `Right wrist angle out of range: ${rightAngle} degrees`
        //     );
        //   }
        // }

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

  private updateAngleHistory(key: string, angle: number) {
    const maxHistory = 3;
    if (!this.lastAngles[key]) {
      this.lastAngles[key] = [];
    }
    if (this.lastAngles[key].length >= maxHistory) {
      this.lastAngles[key].shift();
    }
    this.lastAngles[key].push(angle);
  }

  private isAnglePeak(key: string): boolean {
    const angles = this.lastAngles[key];
    if (angles.length < 3) return false;

    const [prev, current, next] = angles;
    return (
      (current > prev && current > next) || (current < prev && current < next)
    );
  }

  private updateYPositionHistory(key: string, newY: number) {
    const maxHistory = 3;
    if (!this.lastYPositions[key]) {
      this.lastYPositions[key] = [];
    }
    if (this.lastYPositions[key].length >= maxHistory) {
      this.lastYPositions[key].shift();
    }
    this.lastYPositions[key].push(newY);
  }

  private isPeakPosition(key: string): boolean {
    const positions = this.lastYPositions[key];
    console.log(`${key} ${positions}`);

    if (positions.length < 3) return false;

    // Check if the middle position is a peak (either max or min)
    const [prev, current, next] = positions;
    return (
      (current > prev && current > next) || (current < prev && current < next)
    );
  }
}

