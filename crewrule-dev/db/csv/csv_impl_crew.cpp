#include <sstream>
#include "../Segment.h"
#include "UtilFunc.h"
#include "../CrewDB.h"
#include "csv_impl.h"

void crewParser::init(vector<string>& headers) {}


//static vector<string> crewDefaultHeaders = { "id", "airline", "crewId", "firstName", "middleName", "lastName", "preferredName", "seniorityNum", "nationality" };
static vector<string> crewDefaultHeaders = { "id", "airline", "crewId", "division", "firstName", "middleName", "lastName",
"preferredName", "gender", "birthday", "emplDt", "retireDt", "termDt", "seniorityNum",
"nationality", "nationalId", "spouseCrewId", "passportFirstName", "passportMiddleName",
"passportLastName", "grade", "remarks", "status", "depCode", "visaType", "birthPlace", 
"birthCountry", "politics", "nation", "isTransfered", "fromDepartment", "code", "contractType",
"birthPlaceEn", "filiale", "lastModified", "modifiedBy","branchCode","lastPublishDate"};
vector<string>& crewParser::getDefaultHeaders() {
	return crewDefaultHeaders;
}

void* crewParser::createInstance() {
	return new CREW();
}

void crewParser::deleteInstance(void* obj) {
	delete (CREW*)obj;
}

string crewParser::toCsv(vector<string>& headers, void* obj) {
	stringstream ss;
	CREW * ref = (CREW *)obj;
	// "division",  "gender", "birthday", "emplDt", "retireDt", "termDt", , "nationalId", "spouseCrewId", "passportFirstName", "passportMiddleName", "passportLastName", "remarks"
	//"",  "", "", "", "", "", , "", "", "", "", "", "remarks"
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "airline") { ss << ref->airline << "^"; }
		else if (headers[i] == "crewId") { ss << ref->idCrew << "^"; }
		else if (headers[i] == "division") { ss << ref->division << "^"; }
		else if (headers[i] == "firstName") { ss << ref->firstName << "^"; }
		else if (headers[i] == "middleName") { ss << ref->midName << "^"; }
		else if (headers[i] == "lastName") { ss << ref->lastName << "^"; }
		else if (headers[i] == "preferredName") { ss << ref->preferredName << "^"; }
		else if (headers[i] == "gender") { ss << ref->gender << "^"; }
		else if (headers[i] == "birthday") { ss << (ref->birthdayTm.tm_year+1900) << "-" << ref->birthdayTm.tm_mon+1 << "-" << ref->birthdayTm.tm_mday << "^"; }
		else if (headers[i] == "emplDt") { ss << utcToUtcTzString(ref->emplUtc) << "^"; }
		else if (headers[i] == "retireDt") { ss << utcToUtcTzString(ref->retireUtc) << "^"; }
		else if (headers[i] == "termDt") { ss << utcToUtcTzString(ref->termUtc) << "^"; }
		else if (headers[i] == "seniorityNum") { ss << ref->seniorityNum << "^"; }
		else if (headers[i] == "nationality") { ss << ref->nationality << "^"; }
		else if (headers[i] == "nationalId") { ss << ref->natinalIdentification << "^"; }
		else if (headers[i] == "spouseCrewId") { ss << ref->spouseIdcrew << "^"; }
		else if (headers[i] == "passportFirstName") { ss << ref->passportFirstName << "^"; }
		else if (headers[i] == "passportMiddleName") { ss << ref->passportMidName << "^"; }
		else if (headers[i] == "passportLastName") { ss << ref->passportLastName << "^"; }
		else if (headers[i] == "grade") { ss << "^"; }
		else if (headers[i] == "remarks") { ss << ref->remark << "^"; }
		else if (headers[i] == "status") { ss << ref->status << "^"; }
		else if (headers[i] == "depCode") { ss << "^"; }
		else if (headers[i] == "visaType") { ss << "^"; }
		else if (headers[i] == "birthPlace") { ss << "^"; }
		else if (headers[i] == "birthCountry") { ss << "^"; }
		else if (headers[i] == "politics") { ss << "^"; }
		else if (headers[i] == "nation") { ss << "^"; }
		else if (headers[i] == "isTransfered") { ss << "^"; }
		else if (headers[i] == "fromDepartment") { ss << "^"; }
		else if (headers[i] == "code") { ss << "^"; }
		else if (headers[i] == "contractType") { ss << "^"; }
		else if (headers[i] == "birthPlaceEn") { ss << "^"; }
		else if (headers[i] == "filiale") { ss << ref->airline << "^"; }
		else if (headers[i] == "lastModified") { ss << "^"; }
		else if (headers[i] == "modifiedBy") { ss << "^"; }
		else if (headers[i] == "branchCode") { ss << ref->departmentCode << "^";  }
		else if (headers[i] == "lastPublishDate") { ss << utcToUtcDtString(ref->lastPublishDate) << "^"; }
		else { logUnkonwnField("crew", headers[i]); }
	}
	return ss.str();
}

void crewParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CREW * ref = (CREW *)obj;
	if (headers[index] == "id") {  }
	else if (headers[index] == "airline") { ref->airline = value; }
	else if (headers[index] == "crewId") { ref->idCrew = value; }
	else if (headers[index] == "division") { ref->division = value; }
	else if (headers[index] == "firstName") { ref->firstName = value; }
	else if (headers[index] == "middleName") { ref->midName = value; }
	else if (headers[index] == "lastName") { ref->lastName = value; }
	else if (headers[index] == "preferredName") { ref->preferredName = value; }
	else if (headers[index] == "gender") { ref->gender = value; }
	else if (headers[index] == "birthday") { 
		strToTm(value, &ref->birthdayTm);
	}
	else if (headers[index] == "emplDt") { ref->emplUtc = utcStrToUtc(value); }
	else if (headers[index] == "retireDt") { ref->retireUtc = utcStrToUtc(value); }
	else if (headers[index] == "termDt") { ref->termUtc = utcStrToUtc(value); }
	else if (headers[index] == "seniorityNum") { ref->seniorityNum = atoi(value); }
	else if (headers[index] == "nationality") { ref->nationality = value; }
	else if (headers[index] == "nationalId") { ref->natinalIdentification = value; }
	else if (headers[index] == "spouseCrewId") { ref->spouseIdcrew = value; }
	else if (headers[index] == "passportFirstName") { ref->passportFirstName = value; }
	else if (headers[index] == "passportMiddleName") { ref->passportMidName = value; }
	else if (headers[index] == "passportLastName") { ref->passportLastName = value; }
	else if (headers[index] == "grade") {  }
	else if (headers[index] == "remarks") { ref->remark = value; }
	else if (headers[index] == "status") { ref->status = atoi(value); }
	else if (headers[index] == "lastPublishDate") { ref->lastPublishDate = utcStrToUtc(value); }
	else if (headers[index] == "depCode") {}
	else if (headers[index] == "visaType") {  }
	else if (headers[index] == "birthPlace") {}
	else if (headers[index] == "birthCountry") {}
	else if (headers[index] == "politics") {}
	else if (headers[index] == "nation") {}
	else if (headers[index] == "isTransfered") {}
	else if (headers[index] == "fromDepartment") {}
	else if (headers[index] == "code") {}
	else if (headers[index] == "contractType") {}
	else if (headers[index] == "birthPlaceEn") {}
	else if (headers[index] == "filiale") { ref->airline = value; }
	else if (headers[index] == "lastModified") { }
	else if (headers[index] == "role") { }
	else if (headers[index] == "userDepartment") { }
	else if (headers[index] == "modifiedBy") {}//skip
	else if (headers[index] == "tmpName") {}//skip
	else if (headers[index] == "branchCode") { ref->departmentCode = value; }//skip
	else if (headers[index] == "crewName") { }//3.0
	else if (headers[index] == "avatar") { }//3.0
	else if (headers[index] == "tel") { }//3.0
	else if (headers[index] == "idCard") { }//3.0
	else if (headers[index] == "employeeNo") {}//3.0
	else if (headers[index] == "interfaceCrewId") { }//3.0
	else if (headers[index] == "emailAddr") { }//3.0
	else if (headers[index] == "homeAddress") { }//3.0
	else if (headers[index] == "crewDivision") { }//3.0
	else { logUnkonwnField("crew", headers[index]); }

}

