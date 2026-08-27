#include "CrewDB.h"

bool CREW_PREFERENCE::isSame(CREW_PREFERENCE* o) {
	if (!o) {
		return false;
	}
	if (id != 0 && o->id == id) {
		return true;
	}
	if (o->idCrew == idCrew && o->prefType == prefType && o->strDtloc == strDtloc) {
		return true;
	}
	return false;
}