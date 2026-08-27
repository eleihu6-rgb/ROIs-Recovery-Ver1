#include <sstream>
#include <string.h>
#include "../CrewDB.h"
#include "UtilFunc.h"
#include "csv_impl.h"

void crewQualificationParser::init(vector<string>& headers) {}


string crewQualificationParser::toCsv(vector<string>& headers, void* obj) {
	//"", "", "", "", "", "", "", "", "", "", "", "", ""
	stringstream ss;
	CREW_QUALIFICATION * ref = (CREW_QUALIFICATION *)obj;
	for (std::size_t i = 0; i < headers.size(); i++) {
		if (headers[i] == "id") { ss << "^"; }
		else if (headers[i] == "crewId") { ss << ref->idCrew << "^"; }
		else if (headers[i] == "qual") { ss << ref->qual << "^"; }
		else if (headers[i] == "status") { ss << ref->status << "^"; }
		else if (headers[i] == "fleetGroup") { ss << ref->fleetGrp << "^"; }
		else if (headers[i] == "rank") { ss << ref->rank << "^"; }
		else if (headers[i] == "reference") { ss << ref->reference<< "^"; }
		else if (headers[i] == "cancelReason") { ss << ref->cancelReason << "^"; }
		else if (headers[i] == "remark") { ss << ref->remark << "^"; }
		else if (headers[i] == "effDt") { ss << utcToUtcTzString(ref->issuedUtc) << "^"; }
		else if (headers[i] == "expDt") { ss << utcToUtcTzString(ref->expiryUtc) << "^"; }
		else if (headers[i] == "renewedDt") { ss << utcToUtcTzString(ref->renewedUtc) << "^"; }
		else if (headers[i] == "cancelDt") { ss << utcToUtcTzString(ref->cancelUtc) << "^"; }
		else if (headers[i] == "isValid") { ss << (ref->isValid ? "true" : "false") << "^"; }
		else if (headers[i] == "basicMonth") { ss << ref->basicMonth << "^"; }
		else if (headers[i] == "basicMonth2") { ss << ref->basicMonth2 << "^"; }
		else if (headers[i] == "referencePassNo") { ss << ref->referencePassNo << "^"; }
		else if (headers[i] == "referenceId") { ss << "^"; }
		else if (headers[i] == "tmpIssueCountry") { ss << "^"; }
		else if (headers[i] == "tmpIssueAuthority") { ss << "^"; }
		else if (headers[i] == "isPassportType") { ss << "^"; }
		else if (headers[i] == "caoInCabinet") { ss << "^"; }
		else if (headers[i] == "invalidDate") { ss << "^"; }
		else if (headers[i] == "visaMemo") { ss << "^"; }
		else if (headers[i] == "visaType") { ss << "^"; }
		else if (headers[i] == "memo") { ss << "^"; }
		else if (headers[i] == "interfaceId") { ss << "^"; }
		else { logUnkonwnField("crew_qualification", headers[i]); }
	}
	return ss.str();
}

void crewQualificationParser::fromCsv(vector<string>& headers, int index, char* value, void* obj) {
	CREW_QUALIFICATION * ref = (CREW_QUALIFICATION *)obj;

	if (headers[index] == "id") { }
	else if (headers[index] == "crewId") {ref->idCrew = value; }
	else if (headers[index] == "qual") {ref->qual = value; }//Ver2.0
	else if (headers[index] == "qualification") {ref->qual = value; }//Ver3.0
	else if (headers[index] == "certificate") { ref->qual = value; }//Ver3.0 crew_certificate
	else if (headers[index] == "language") { ref->qual = value; }//Ver3.0 crew_language
	else if (headers[index] == "languageLevel") { ref->languageLevel = atoi(value); }
	else if (headers[index] == "status") { ref->status = (value == nullptr || strlen(value) == 0) ? "A" : value; }//status默认值为A即有效资质 
	else if (headers[index] == "fleetGroup") { ref->fleetGrp = value; }//Ver2.0
	else if (headers[index] == "fleetSpecific") { ref->fleetGrp = value; }//Ver3.0
	else if (headers[index] == "acType") { ref->acType = value; }//Ver3.0
	else if (headers[index] == "acType") {}//Ver3.0
	else if (headers[index] == "position") {}//Ver3.0
	else if (headers[index] == "rank") { ref->rank = value; }
	else if (headers[index] == "reference") { ref->reference = value; }
	else if (headers[index] == "cancelReason") { ref->cancelReason = value; }
	else if (headers[index] == "remark") { ref->remark = value; }//Ver2.0
	else if (headers[index] == "remarks") { ref->remark = value; }//Ver3.0
	else if (headers[index] == "effDt") { ref->issuedUtc = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "expDt") { ref->expiryUtc = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "earliestDate") { ref->earliestUtc = (value == NULL || strlen(value) == 0) ? 0 : utcStrToUtc(value); }
	else if (headers[index] == "latestDate") { ref->latestUtc = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "renewedDt") { ref->renewedUtc = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "cancelDt") { ref->cancelUtc = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "isValid") { ref->isValid = (0 == strcmp("true", value)); }
	else if (headers[index] == "basicMonth") { ref->basicMonth = atoi(value); }
	else if (headers[index] == "basicMonth2") { ref->basicMonth2 = atoi(value); }
	else if (headers[index] == "baseMonth") { ref->baseMonthStartUtc = (value == NULL || strlen(value) == 0) ? 0 : utcStrToUtc(value); }
	else if (headers[index] == "referencePassNo") { ref->referencePassNo = value; }
	else if (headers[index] == "referenceId") {}
	else if (headers[index] == "tmpIssueCountry") {}
	else if (headers[index] == "tmpIssueAuthority") {}
	else if (headers[index] == "isPassportType") {}
	else if (headers[index] == "caoInCabinet") {}
	else if (headers[index] == "invalidDate") {}
	else if (headers[index] == "invalidDt") { ref->invaildUtc = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else if (headers[index] == "visaMemo") {}
	else if (headers[index] == "visaType") {}
	else if (headers[index] == "memo") {}
	else if (headers[index] == "interfaceId") {}
	else if (headers[index] == "licenseNo") {}
	else if (headers[index] == "licenseType") {}
	else if (headers[index] == "acTypes") {}
	else if (headers[index] == "refLanguageId") {}
	else if (headers[index] == "refInstructorId") {}
	else if (headers[index] == "certificateNo") {}
	else if (headers[index] == "interfaceCrewId") {}
	else if (headers[index] == "interfaceCrewCertId") {}
	else if (headers[index] == "interfaceCrewQualId") {}
	else if (headers[index] == "interfaceCrewLicId") {}
	else if (headers[index] == "referenceNo") {}
	else if (headers[index] == "remainDays") {}
	else if (headers[index] == "firstName") {}
	else if (headers[index] == "middleName") {}
	else if (headers[index] == "lastName") {}
	else if (headers[index] == "remarkDetails") {}
	else if (headers[index] == "airport") {}
	else if (headers[index] == "crewLicenseId") {}
	else if (headers[index] == "abbr") {}
	else if (headers[index] == "isPrimary") {}
	else if (headers[index] == "lastModified") {}
	else if (headers[index] == "modifiedBy") {}
	else if (headers[index] == "trainingStatus") {}
	else if (headers[index] == "nationality") {}
	else if (headers[index] == "interfaceCrewRecurrentId") {}
	else if (headers[index] == "qualificationChangeLabel") {}
	else if (headers[index] == "qualificationGroup") {}
	else if (headers[index] == "interfaceQualificationId") {}
	else if (headers[index] == "projectDate") {}
	else if (headers[index] == "recordStatus") {}
	else if (headers[index] == "surname") {}
	else if (headers[index] == "titleName") {}
	else if (headers[index] == "givenName") {}
	else if (headers[index] == "isCtaSend") { ref->isCtaSend = std::string(value) == "Y"; }
	else if (headers[index] == "isMclSend") { ref->isMclSend = std::string(value) == "Y"; }
	else if (headers[index] == "projectionExpiryDate") { ref->projectionExpiryDate = (value == NULL || strlen(value) == 0) ? utcStrToUtc("9999-12-31") : utcStrToUtc(value); }
	else { logUnkonwnField("crew_qualification", headers[index]); }
}

void* crewQualificationParser::createInstance() {
	return new CREW_QUALIFICATION();
}

void crewQualificationParser::deleteInstance(void* obj) {
	delete (CREW_QUALIFICATION*)obj;
}

static vector<string> crewQualificationDefaultHeaders = { "id", "crewId", "qual", "status", "fleetGroup", "rank", "reference", "cancelReason", "remark", "effDt", "expDt", "renewedDt", "cancelDt", "isValid", "basicMonth", "basicMonth2", "referencePassNo",
"referenceId","tmpIssueCountry","tmpIssueAuthority","isPassportType","caoInCabinet","invalidDate","visaMemo","visaType","memo"};
vector<string>& crewQualificationParser::getDefaultHeaders() {
	return crewQualificationDefaultHeaders;
}