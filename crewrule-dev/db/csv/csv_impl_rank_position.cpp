#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void rankPositionParser::init(vector<string>& headers) {}


static vector<string> rankPositionDefaultHeaders = { "id", "airline", "rankId", "position", "division", "displayOrder", 
"description", "rank", "lastModified", "modifiedBy" };
vector<string>& rankPositionParser::getDefaultHeaders() {
	return rankPositionDefaultHeaders;
}

void* rankPositionParser::createInstance() {
	return new RANK_POSITION();
}

void rankPositionParser::deleteInstance(void* obj) {
	delete (RANK_POSITION*)obj;
}

string rankPositionParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	RANK_POSITION * ref = (RANK_POSITION *)obj;
	//"id", "airline", "rank", "", "", "description"
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "airline") { ss << ref->airline << "^"; }
		else if (headers[i] == "rankId") { ss << ref->rankId << "^"; }
		else if (headers[i] == "position") { ss << ref->position << "^"; }
		else if (headers[i] == "division") { ss << ref->division << "^"; }
		else if (headers[i] == "displayOrder") { ss << ref->displayOrder << "^"; }
		else if (headers[i] == "description") { ss << "^"; }
		else if (headers[i] == "rank") { ss << ref->rank << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else { logUnkonwnField("rank_position", headers[i]); }
	}
	return ss.str();
}

void rankPositionParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	RANK_POSITION * ref = (RANK_POSITION *)obj;
	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "airline") { ref->airline = value; }
	else if (headers[index] == "rankId") { ref->rankId = atoll(value); }
	else if (headers[index] == "position") { ref->position = value; }
	else if (headers[index] == "division") { ref->division = value; }
	else if (headers[index] == "displayOrder") { ref->displayOrder = atoi(value); }
	else if (headers[index] == "description") {}
	else if (headers[index] == "rank") { ref->rank = value; }
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else { logUnkonwnField("rank_position", headers[index]); }
}

