var spinnerStart = Scheduler(300,400);
var spinnerCancel;


// ***********************

export { startSpinner, stopSpinner, };


// ***********************

function startSpinner() {
	if (!spinnerCancel) {
		spinnerCancel = spinnerStart(showSpinner);
	}
}

function showSpinner() {
	Swal.fire({
		position: "top",
		showConfirmButton: false,
		allowOutsideClick: false,
		allowEscapeKey: false,
		customClass: {
			popup: "spinner-popup",
		},
	});
	Swal.showLoading();
}

function stopSpinner() {
	if (spinnerCancel) {
		spinnerCancel();
		spinnerCancel = null;
		if (Swal.isVisible() && Swal.getPopup().matches(".spinner-popup")) {
			return Swal.close();
		}
	}
}

function Scheduler(debounceMin,throttleMax) {
	var entries = new WeakMap();

	return schedule;


	// ***********************

	function schedule(fn) {
		var entry;

		if (entries.has(fn)) {
			entry = entries.get(fn);
		}
		else {
			entry = {
				last: 0,
				timer: null,
			};
			entries.set(fn,entry);
		}

		var now = Date.now();

		if (!entry.timer) {
			entry.last = now;
		}

		if (
			// no timer running yet?
			entry.timer == null ||
			// room left to debounce while still under the throttle-max?
			(now - entry.last) < throttleMax
		) {
			if (entry.timer) {
				clearTimeout(entry.timer);
			}

			let time = Math.min(debounceMin,Math.max(0,(entry.last + throttleMax) - now));
			entry.timer = setTimeout(run,time,fn,entry);
		}

		if (!entry.cancelFn) {
			entry.cancelFn = function cancel(){
				if (entry.timer) {
					clearTimeout(entry.timer);
					entry.timer = entry.cancelFn = null;
				}
			};
		}
		return entry.cancelFn;
	}

	function run(fn,entry) {
		entry.timer = entry.cancelFn = null;
		entry.last = Date.now();
		fn();
	}
}
