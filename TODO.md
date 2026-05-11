# TODO

- (DONE) show json output in app for faster development
- (DONE) have buttons to navigate to using waze and google maps for detail pages as well as the favourited parkings.
- (DONE) No results: Add a button to clear filter
- (DONE ) Show live availability of all possible parkings (different api's) - 9 in total + predictions based on occupancy
- (DONE) Find availability parking Kouter, add availability Kouter and Zuid (interparking parkings) -- Found this from https://www.parkings.gent/: https://data.stad.gent/api/records/1.0/search/?dataset=mobi-parkings&q=(parkingtype:Parking+OR+parkingtype:P%2BR)&sort=-availablecapacity&rows=100&lang=nl&apikey=5e015407b7e6f1e916f294d145a90be13c288ee4a8fc565001b805a4
Will only take Kouter, Zuid and Center from it. + take the images as well from the api.
- (DONE) update favicon. 
- (DONE) Figure out addresses - some aren't known and should I display P+R? different api... => https://gent.opendatasoft.com/explore/dataset/locaties-openbare-parkings-gent/table/
- (DONE) remove unused shadcn/ui components
- (DONE) If the user navigates to a certain parking page and they have not filled in their profile information yet, they should instead be rerouted to the profile page. 
- (DONE) personalize loading skeleton for the profile page so it fits it better. 
- (DONE) Adapt main loading skeleton based on list view vs card view and amount of favorites.
- (DONE) Remove the formatted json
- (DONE) Sometimes you'll see it says that the amount that is free in a parking is -1 or so. So handle this gracefully because it won't work well with the percentages and so on. So yeah, prepare for that. 
- (DONE) add vitest unit tests

- (WON'T DO - NO TIME) Add dutch to the app? (https://next-intl.dev/)
- (WON'T DO - NO TIME) Have an embedded google map where all parkings are shown.
- Update Readme