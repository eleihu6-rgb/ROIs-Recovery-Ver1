#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmFootprintCourseIpRoleParser::init(vector<string>& headers) {}


static vector<string> tmFootprintCourseIpRoleDefaultHeaders = { "id", "footprintId", "footprintCourseId", "footprintTraineeId", "bases", "ranks", "modifiedBy", "lastModified" };
vector<string>& tmFootprintCourseIpRoleParser::getDefaultHeaders() {
	return tmFootprintCourseIpRoleDefaultHeaders;
}

void* tmFootprintCourseIpRoleParser::createInstance() {
	return new TmFootprintCourseIpRole();
}

void tmFootprintCourseIpRoleParser::deleteInstance(void* obj) {
	delete (TmFootprintCourseIpRole*)obj;
}

string tmFootprintCourseIpRoleParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmFootprintCourseIpRole * ref = (TmFootprintCourseIpRole *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "footprintId") { ss << ref->footprintId << "^"; }
		else if (headers[i] == "footprintCourseId") { ss << ref->footprintCourseId << "^"; }
		else if (headers[i] == "footprintTraineeId") { ss << ref->footprintTraineeId << "^"; }
		else if (headers[i] == "bases") { ss << ref->base << "^"; }
		else if (headers[i] == "ranks") { ss << ref->rank << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmFootprintCourseIpRole", headers[i]); }
	}
	return ss.str();
}

void tmFootprintCourseIpRoleParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmFootprintCourseIpRole * ref = (TmFootprintCourseIpRole *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "footprintId") { ref->footprintId = atoll(value); }
	else if (headers[index] == "footprintCourseId") { ref->footprintCourseId = atoll(value); }
	else if (headers[index] == "footprintTraineeId") { ref->footprintTraineeId = atoll(value); }
	else if (headers[index] == "bases") {
		ref->base = value;
		if (!ref->base.empty() && ref->base != "ALL" && ref->base != "*") {
			split(ref->base, '|', ref->bases);
		}
	}
	else if (headers[index] == "ranks") {
		ref->rank = value;
		if (!ref->rank.empty() && ref->rank != "ALL" && ref->rank != "*") {
			split(ref->rank, '|', ref->ranks);
		}
	}
	else if (headers[index] == "modifiedBy") { }
	else if (headers[index] == "lastModified") { }
	else { logUnkonwnField("tmFootprintCourseIpRole", headers[index]); }
}
