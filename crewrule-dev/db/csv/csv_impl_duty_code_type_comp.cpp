#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void dutyCodeTypeCompParser::init(vector<string>& headers) {}


static vector<string> dutyCodeTypeCompDefaultHeaders = { "id", "dutyAssignment", "comp", "option", "reqPairCompCout", "reqDutyCodeTypeComp", "name", "division", "modifiedBy", "lastModified" };
vector<string>& dutyCodeTypeCompParser::getDefaultHeaders() {
	return dutyCodeTypeCompDefaultHeaders;
}

void* dutyCodeTypeCompParser::createInstance() {
	return new DutyCodeTypeComp();
}

void dutyCodeTypeCompParser::deleteInstance(void* obj) {
	delete (DutyCodeTypeComp*)obj;
}

string dutyCodeTypeCompParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	DutyCodeTypeComp* ref = (DutyCodeTypeComp*)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "dutyAssignment") { ss << ref->dutyAssignment << "^"; }
		else if (headers[i] == "comp") { ss << ref->comp << "^"; }
		else if (headers[i] == "option") { ss << ref->option << "^"; }
		else if (headers[i] == "reqPairCompCout") { ss << ref->reqPairCompCout << "^"; }
		else if (headers[i] == "reqDutyCodeTypeComp") { ss << ref->reqDutyCodeTypeComp << "^"; }
		else if (headers[i] == "name") { ss << ref->name << "^"; }
		else if (headers[i] == "division") { ss << ref->division << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("dutyCodeTypeComp", headers[i]); }
	}
	return ss.str();
}

void dutyCodeTypeCompParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	DutyCodeTypeComp* ref = (DutyCodeTypeComp*)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "dutyAssignment") { ref->dutyAssignment = value; }
	else if (headers[index] == "comp") { ref->comp = value; }
	else if (headers[index] == "option") { ref->option = value; }
	else if (headers[index] == "reqPairCompCout") { 
		ref->reqPairCompCout = value; 
		if (!ref->reqPairCompCout.empty()) {
			split(ref->reqPairCompCout, ';', ref->reqPairCompCoutList);
		}
	}
	else if (headers[index] == "reqDutyCodeTypeComp") { 
		ref->reqDutyCodeTypeComp = value; 
		if (!ref->reqDutyCodeTypeComp.empty()) {
			split(ref->reqDutyCodeTypeComp, '|', ref->reqDutyCodeTypeCompList);
		}
	}
	else if (headers[index] == "name") { ref->name = value; }
	else if (headers[index] == "division") { ref->division = value; }
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "lastModified") {}
	else { logUnkonwnField("dutyCodeTypeComp", headers[index]); }
}

