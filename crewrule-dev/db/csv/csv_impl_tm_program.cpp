#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void tmProgramParser::init(vector<string>& headers) {}


static vector<string> tmProgramDefaultHeaders = { "id","name","programDesc","footprintId","recurrentFlag","startDate","endDate","status","crewId","crewName","buddyType","createTime","firstDutyDate","firstDutyDateId","firstDutyDateType","courseSequence","generationMethod","createUser","footprint","lastModified","modifiedBy" };
vector<string>& tmProgramParser::getDefaultHeaders() {
	return tmProgramDefaultHeaders;
}

void* tmProgramParser::createInstance() {
	return new TmProgram();
}

void tmProgramParser::deleteInstance(void* obj) {
	delete (TmProgram*)obj;
}

string tmProgramParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	TmProgram * ref = (TmProgram *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {

		if (headers[i] == "id") { ss << ref->id << "^"; }
		else if (headers[i] == "name") { ss << ref->name << "^"; }
		else if (headers[i] == "programDesc") { ss << ref->programDesc << "^"; }
		else if (headers[i] == "footprintId") { ss << ref->footprintId << "^"; }
		else if (headers[i] == "recurrentFlag") { ss << ref->recurrentFlag << "^"; }
		else if (headers[i] == "startDate") { ss << utcToUtcTzString(ref->startDate) << "^"; }
		else if (headers[i] == "endDate") { ss << utcToUtcTzString(ref->endDate) << "^"; }
		else if (headers[i] == "status") { ss << ref->status << "^"; }
		else if (headers[i] == "crewId") { ss << ref->crewId << "^"; }
		else if (headers[i] == "crewName") { ss << ref->crewName << "^"; }
		else if (headers[i] == "buddyType") { ss << ref->buddyType << "^"; }
		else if (headers[i] == "firstDutyDate") { ss << utcToUtcTzString(ref->firstDutyDate) << "^"; }
		else if (headers[i] == "firstDutyDateId") { ss << ref->firstDutyDateId << "^"; }
		else if (headers[i] == "firstDutyDateType") { ss << ref->firstDutyDateType << "^"; }
		else if (headers[i] == "courseSequence") { ss << ref->courseSequence << "^"; }
		else if (headers[i] == "footprint") { ss << ref->footprint << "^"; }
		else if (headers[i] == "generationMethod") { ss << ref->generationMethod << "^"; }
		else if (headers[i] == "createUser") { ss << "^"; }
		else if (headers[i] == "createTime") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else { logUnkonwnField("tmProgram", headers[i]); }
	}
	return ss.str();
}

void tmProgramParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	TmProgram * ref = (TmProgram *)obj;

	if (headers[index] == "id") { ref->id = atoll(value); }
	else if (headers[index] == "name") { ref->name = value; }
	else if (headers[index] == "programDesc") { ref->programDesc = value; }
	else if (headers[index] == "footprintId") { ref->footprintId = atoll(value); }
	else if (headers[index] == "recurrentFlag") { ref->recurrentFlag = atoi(value); }
	else if (headers[index] == "startDate") { ref->startDate = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "endDate") { ref->endDate = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "status") { 
		ref->status = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value);
	}
	else if (headers[index] == "crewId") { ref->crewId = value; }
	else if (headers[index] == "crewName") { ref->crewName = value; }
	else if (headers[index] == "buddyType") { ref->buddyType = atoi(value); }
	else if (headers[index] == "firstDutyDate") { ref->firstDutyDate = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "firstDutyDateId") { ref->firstDutyDateId = atoll(value); }
	else if (headers[index] == "firstDutyDateType") { ref->firstDutyDateType = value; }
	else if (headers[index] == "courseSequence") { ref->courseSequence = atoi(value); }
	else if (headers[index] == "footprint") { ref->footprint = value; }
	else if (headers[index] == "createUser") { }
	else if (headers[index] == "createTime") { }
	else if (headers[index] == "modifiedBy") { }
	else if (headers[index] == "lastModified") { }
	else if (headers[index] == "memo") { }
	else if (headers[index] == "generationMethod") { ref->generationMethod = (value == NULL || strlen(value) == 0) ? "" : strToUpper(value); }
	else if (headers[index] == "crewRecurrentId") {}
	else if (headers[index] == "externalTrnProgramId") {}
	else { logUnkonwnField("tmProgram", headers[index]); }
}

