#include <sstream>
#include <string.h>
#include "../CrewDB.h"
#include "UtilFunc.h"
#include "csv_impl.h"

void crewBaseParser::init(vector<string>& headers) {}


//mantis#2228, 增加crew_base.isPrimeBase读写
string crewBaseParser::toCsv(vector<string>& headers, void* obj) {
	//"id", "crewId", "", "effDt", "expDt
	stringstream ss;
	CREW_BASE * ref = (CREW_BASE *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "crewId") { ss << ref->idCrew << "^"; }
		else if (headers[i] == "base") { ss << ref->base << "^"; }
		else if (headers[i] == "effDt") { ss << utcToUtcTzString(ref->effLoc) << "^"; }
		else if (headers[i] == "expDt") { ss << utcToUtcTzString(ref->expLoc) << "^"; }
		else if (headers[i] == "isPrimeBase") { ss << (ref->isPrime ? "true" : "false") << "^"; } 
		else { logUnkonwnField("crew_base", headers[i]); }
	}
	return ss.str();
}

//mantis#2228, 增加crew_base.isPrimeBase读写
void crewBaseParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CREW_BASE * ref = (CREW_BASE *)obj;

	if (headers[index] == "id") {}
	else if (headers[index] == "crewId") { ref->idCrew = value; }
	else if (headers[index] == "base") { ref->base = value; }
	else if (headers[index] == "effDt") { ref->effLoc = (value == NULL||strlen(value)==0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "expDt") { ref->expLoc = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "isPrimeBase") { ref->isPrime = (0 == strncmp(value, "true", 5)); }
	else if (headers[index] == "interfaceCrewBaseId") { }
	else if (headers[index] == "lastModified") { }
	else if (headers[index] == "modifiedBy") { }
	else { logUnkonwnField("crew_base", headers[index]); }
}

void* crewBaseParser::createInstance() {
	return new CREW_BASE();
}

void crewBaseParser::deleteInstance(void* obj) {
	delete (CREW_BASE*)obj;
}

static vector<string> crewBaseDefaultHeaders = { "id", "crewId", "base", "effDt", "expDt", "isPrimeBase" };
vector<string>& crewBaseParser::getDefaultHeaders() {
	return crewBaseDefaultHeaders;
}