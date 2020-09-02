let array = [];
self.addEventListener("message", event => {
    console.log(event);
    if (event.data === "download") {
        const blob = new Blob(array);
        self.postMessage(blob);
        array = [];
    } else {
        array.push(event.data);
    }
})