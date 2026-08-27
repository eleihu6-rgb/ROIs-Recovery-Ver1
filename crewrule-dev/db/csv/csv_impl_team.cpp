#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void teamParser::init(vector<string>& headers) {}


static vector<string> teamDefaultHeaders = { "id", "airline", "team", "description", "displayOrder", "headColor",
"lastModified", "modifiedBy", "filiale", "division" };
vector<string>& teamParser::getDefaultHeaders() {
	return teamDefaultHeaders;
}

void* teamParser::createInstance() {
	return new Team();
}

void teamParser::deleteInstance(void* obj) {
	delete (Team*)obj;
}

string teamParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	Team * ref = (Team *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "airline") { ss << ref->airline << "^"; }
		else if (headers[i] == "team") { ss << ref->team << "^"; }
		else if (headers[i] == "description") { ss << ref->description << "^"; }
		else if (headers[i] == "displayOrder") { ss << ref->displayOrder << "^"; }
		else if (headers[i] == "headColor") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "filiale") { ss << "^"; }
		else if (headers[i] == "division") { ss << "^"; }
		else { logUnkonwnField("team", headers[i]); }
	}
	return ss.str();
}

void teamParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	Team * ref = (Team *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "airline") { ref->airline = value; }
	else if (headers[index] == "team") { ref->team = value; }
	else if (headers[index] == "description") { ref->description = value; }
	else if (headers[index] == "displayOrder") { ref->displayOrder = atoi(value); }
	else if (headers[index] == "headColor") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "filiale") {}
	else if (headers[index] == "division") {}
	else if (headers[index] == "teamGroup") {}
	else { logUnkonwnField("team", headers[index]); }
}

