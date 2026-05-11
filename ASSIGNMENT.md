# Technical Interview Assignment: React Parking Availability App

For the technical aspect of this interview, we would like you to build a small React application.

Please spend no more than three hours on this. Don’t worry if you can’t finish everything in that time. The purpose of this test is to see if you grasp basic front-end development concepts.

Focus on the functionality first. The look and feel of the app are secondary, but not unimportant.

---

## Problem

The Lynx offices in Ghent are on the Kouter. Underneath the Kouter, there is a parking garage.

Some of our colleagues drive to work by car, and some have been complaining that they have no way of knowing whether there is still parking space available before arriving at the office. If the parking is full, they lose a lot of time finding somewhere else to park.

---

## Solution

As you may or may not know, the city of Ghent provides a lot of interesting information through its open data portal (https://gent.opendatasoft.com/explore/?disjunctive.theme&sort=modified).

This also includes real-time data on the available parking spaces in Ghent’s several parking structures.(https://gent.opendatasoft.com/api/records/1.0/search/?dataset=bezetting-parkeergarages-real-time)

To help your future colleagues, we would like you to build a small web app that shows us how many spaces are available in the parking garages in Ghent.

---

## User Flow

### First Visit

The first time the user visits the app, they should be asked to make an “account”.

Provide a form where the user is asked to enter:

- First name
- Last name
- License plate
- Make and model of their car

This data should persist when refreshing the page.

The form should no longer be shown if we detect that the user has already filled it out on this device.

---

## Profile Management

The user should be able to:

- Change their details through a small profile page
- Remove their data entirely

---

## Parking Overview

After filling out the form, the user should be presented with an overview of all parking structures in Ghent.

The overview should clearly show:

- Name of the parking structure
- Whether it is open or closed
- Number of available spaces
- Address

The user should also be able to:

- Sort parking structures ascending or descending by name
- Sort parking structures ascending or descending by free parking spaces
- Search for a parking structure by name

### Bonus

For bonus points, the user can set a favorite parking structure, which should always be shown at the top of the list.

---

## Parking Detail Page

When the user clicks on a parking structure, they should see the details for the selected parking structure.

The detail page should show:

- Name
- Description
- Opening hours
- Link to the website
- Operator of the parking structure
- Category: inside or outside the Low Emission Zone
- Type of parking

### Bonus

For bonus points, show where the parking structure is located on an embedded Google Map.

---

## Notes

Bonus points are not required.

Please only add bonus features if you have completed everything else, still have time left, and want to do it.