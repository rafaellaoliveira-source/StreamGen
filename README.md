# StreamGen: An Interactive Web-Based Generator of Non-Stationary Data Streams 

Stream Generator StreamGen is a web-based application for generating synthetic labeled data streams with configurable drift, requiring no programming expertise or software installation. It is available at 
[stream-gen.vercel.app](https://stream-gen.vercel.app/).

---

## Table of Contents

- [Overview](#overview)
- [Interface](#interface)
- [Getting Started](#getting-started)
- [Configuration Parameters](#configuration-parameters)
- [Drift Types](#drift-types)
- [Output Files](#output-files)
- [Advanced Features](#advanced-features)
- [Citation](#citation)

---

## Overview 

StreamGen allows researchers to generate synthetic multi-label and multiclass data streams by drawing centroid trajectories directly on an interactive canvas. The drift type (abrupt, gradual, incremental, or recurrent) emerges naturally from the geometric and temporal configuration of the drawn segments, making the relationship between stream structure and drift behavior immediately observable. Concept evolution is also supported natively, allowing new classes to emerge at precisely defined time steps by introducing additional clusters with independent temporal windows, in isolation or in combination with concept drift.
<!-- 
![](streamGen\docs\StreamGenMarkedInterface.png "StreamGen Home screen")Figure 1 - StreamGen Home Screen Example

- (a) Indicates the sidebar with the stream settings.
- (b) Presents the toolbar containing the main buttons
- (c)  The canvas where users draw centroid trajectories -->

---

## Interface


<!-- ![StreamGen Home screen](streamGen\resources\images\StreamGenMarkedInterface.png "StreamGen Home screen") -->
<figure>
    <center><figcaption>StreamGen home screen example</figcaption>
    <img src="streamGen\resources\images\StreamGenMarkedInterface.png" alt="drawing" style="width:810px;"/> </center>
</figure>

<!-- *Figure 1 — StreamGen home screen.* -->

- **(a)** Sidebar containing stream configuration parameters
- **(b)** Toolbar with the main action buttons
- **(c)** Canvas where users draw centroid trajectories

---

## Getting Started

1. Open [stream-gen.vercel.app](https://stream-gen.vercel.app/) in 
your browser (no installation required).
2. Configure the stream parameters in the sidebar **(a)**.
3. Select the input mode (Free-draw or Points) in the toolbar **(b)**.
4. Draw the centroid trajectory on the canvas **(c)**.
5. Click **Generate Stream** to animate and compute the dataset.
6. Download the output files using the CSV, ARFF, or META buttons.

<!-- ![til](streamGen\resources\images\streamgenIncrementalExample.gif) -->
<figure>
    <center><figcaption>StreamGen incremental stream generation example</figcaption>
    <img src="streamGen\resources\images\streamgenIncrementalExample.gif"/> </center>
</figure>




---

## Configuration Parameters

| Parameter | Description | Default |
|---|---|---|
| Standard Deviation (σ) | Controls the spread of each cluster | 0.05 |
| Instances per tick | Number of instances generated per centroid per tick | 100 |
| Stream duration (t) | Start and end tick of the stream | 1 – 100 |
| Label mode | Multiclass or Multi-label generation | Multiclass |
| Overlap radius (N·σ) | Multi-label region radius (only in Multi-label mode) | 3·σ |
| Extra features | Number of additional features generated via Moore neighborhood convolution | 0 |
| Distribution | Gaussian or RandomRBF | Gaussian |

---

## Drift Types

The drift type is determined by how segments are configured on the 
canvas. StreamGen supports four types:

| Drift Type | Configuration | Description |
|---|---|---|
| Abrupt | Two disconnected point segments | Instantaneous centroid jump at transition tick |
| Gradual | Two free-draw segments with overlap > 0 | Both centroids coexist during transition window |
| Incremental | Single continuous free-draw trajectory | Smooth centroid displacement throughout stream |
| Recurrent | Three segments with first and last spatially overlapping | Concept returns to a previously occupied region |

StreamGen also supports **concept evolution**, where a new cluster is 
introduced at a specific tick, representing the emergence of a new 
class without replacing existing ones.

---

## Output Files

After generating a stream, three types of files are available for 
download:

| File | Description |
|---|---|
| `dataset.csv` / `dataset.arff` | Complete labeled stream with all instances |
| `train.csv` / `test.csv` | Chronological train/test split |
| `META.txt` | Drift annotations and segment metadata |

The ARFF format is compatible with MOA and Weka. The META.txt file 
contains the drift start and end ticks for each cluster, the segment 
configuration, and the generation timestamp.

---

## Advanced Features

### Multi-label Generation
When Multi-label mode is selected, instances within radius $r = N·σ$ 
of another cluster centroid receive multiple class labels 
simultaneously. The value of N is configurable in the range [1, 6].

### Extra Features
Additional features ($f_3$…$f_n$) are generated via Moore 
neighborhood convolution over a fixed 100×100 grid, using the same σ 
as the spatial features. Their centroids follow the cluster trajectory 
over time, ensuring all features reflect the drift consistently.

### Concept Evolution
A new cluster can be introduced at any tick by setting its start time 
after the stream begins. The new cluster generates instances only from 
its configured start tick onward, and can be spatially isolated from 
existing clusters to represent a fully new concept.
