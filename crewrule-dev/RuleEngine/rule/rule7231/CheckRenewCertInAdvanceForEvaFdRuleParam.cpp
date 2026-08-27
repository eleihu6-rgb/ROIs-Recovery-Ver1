#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "CheckRenewCertInAdvanceForEvaFdRuleParam.h"
#include "CrewDB.h"
#include "../utils/TimeUtils.h"
#include "index/TmProgramIndex.h"
#include "../utils/TrainingCourseUtils.h"

using namespace std;

void CheckRenewCertInAdvanceForEvaFdRuleParam::ParseParam(const std::string& paramString) {
	std::stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		std::string substr;
		std::getline(ss, substr, delimInParam);
		if (!substr.empty()) {
			switch (i) {
			case enum_to_underlying(ParamLocation::BASES): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _bases);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::RANKS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _ranks);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLEETS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _fleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::TEAMS): {
				if (substr != RuleParamConstant::ALL) {
					split(substr, '|', _teams);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::CERTIFICATE_TYPES): {
				_certificateTypes = substr;
				_certificateTypesMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::ASSIGNMENT): {
				_assignments = substr;
				_assignmentsMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::COURSE_CODES): {
				_courseCodes = substr;
				_courseCodeMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::SKIP_HOLIDAY): {
				_isSkipHoliday = (substr == "Y");
				break;
			}
			case enum_to_underlying(ParamLocation::HOLIDAY_COUNTRIES): {
				_holidayCountries = substr;
				_holidayCountriesMatch.SetExpression(substr, this->GetRule());
				break;
			}
			case enum_to_underlying(ParamLocation::RENEWAL_WINDOW): {
				_renewalWindow = substr;

				vector<string> splitstrs;
				split(_renewalWindow.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_renewalWindowLower = atoi(splitstrs[0].c_str());
					_renewalWindowUpper = atoi(splitstrs[1].c_str());
				}
				break;
			}
			case enum_to_underlying(ParamLocation::TYPE): {
				_strTypes = substr;
				if (substr != RuleParamConstant::ALL) {
					split(substr.c_str(), '|', _types);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::SEVERITY): {
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			}
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
			}
		}
	}
}

void CheckRenewCertInAdvanceForEvaFdRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	//Bases,Ranks,Fleets,Teams,Certificate Types,Assignment,Course Codes,Skip Holiday(Y/N),Holiday Countries,Renewal Window,Type
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;

		if (header == "BASES") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _bases);
			}
		}
		else if (header == "RANKS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _ranks);
			}
		}
		else if (header == "FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _fleets);
			}
		}
		else if (header == "TEAMS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _teams);
			}
		}
		else if (header == "CERTIFICATE TYPES") {
			_certificateTypes = headeValue;
			_certificateTypesMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "ASSIGNMENT") {
			_assignments = headeValue;
			_assignmentsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "COURSE CODES") {
			_courseCodes = headeValue;
			_courseCodeMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "SKIP HOLIDAY(Y/N)") {
			_isSkipHoliday = (headeValue == "Y");
		}
		else if (header == "HOLIDAY COUNTRIES") {
			_holidayCountries = headeValue;
			_holidayCountriesMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "RENEWAL WINDOW") {
			_renewalWindow = headeValue;

			vector<string> splitstrs;
			split(_renewalWindow.c_str(), '-', splitstrs);
			if (splitstrs.size() >= 2) {
				_renewalWindowLower = atoi(splitstrs[0].c_str());
				_renewalWindowUpper = atoi(splitstrs[1].c_str());
			}
		}
		else if (header == "TYPE") {
			_strTypes = headeValue;
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue.c_str(), '|', _types);
			}
		}
		else if (header == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}


bool CheckRenewCertInAdvanceForEvaFdRuleParam::MatchCrewQualification(std::shared_ptr<CREW> crew, const time_t& checkedStartTime, const time_t& checkedEndTime) const {
	std::vector<string> positions;
	if (Utility::GetInstancePtr()->isCrewQualified(crew, _bases, _ranks, _fleets, _teams, positions, checkedStartTime, checkedEndTime))
		return true;
	return false;
}

bool CheckRenewCertInAdvanceForEvaFdRuleParam::MatchAssignment(const ROSTER* roster) const {
	return _assignmentsMatch.Match(*roster);
}

bool CheckRenewCertInAdvanceForEvaFdRuleParam::MatchTrainingRole(const ROSTER* roster, const Segment* segment) const {
	if (this->_courseCodes.empty() || this->_courseCodes == RuleParamConstant::IGNORED) {
		return true;
	}
	//课程仅针对TE角色
	auto& dbData = this->GetRule()->GetDataContext();
	if (segment == nullptr) {
		auto programCourseList = dbData->tmProgramCourseIndex->getByRosterId(roster->rosterId);
		if (programCourseList.empty()) {
			return false;
		}
	}
	else {
		auto programCourse = dbData->tmProgramCourseIndex->getByRosterId(roster->rosterId, segment->getDBId());
		if (programCourse == nullptr) {
			return false;
		}
		auto tmCourse = TrainingCourseUtils::GetCourseByCourseId(programCourse->courseId, dbData);
		if (tmCourse == nullptr) {
			return false;
		}
		this->GetRule()->getRuleViolation().SetParam("courseCode", tmCourse->courseCode);
	}
	return true;
}

bool CheckRenewCertInAdvanceForEvaFdRuleParam::MatchCertificate(const std::shared_ptr<CREW_QUALIFICATION>& certificate, const time_t checkedStartTime, const time_t checkedEndTime) const {
	if (!_certificateTypesMatch.Match(certificate->qual)) {
		return false;
	}

	////“资质过期时间”在场景范围内[checkedStartTime,checkedEndTime]返回true，否则返回false
	//time_t eff = certificate->issuedUtc;
	//time_t exp = certificate->expiryUtc;
	//if (exp < checkedStartTime || exp >checkedEndTime) {
	//	return false;
	//}

	return true;
}

bool CheckRenewCertInAdvanceForEvaFdRuleParam::MatchParam(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const {
	if (!_assignmentsMatch.Match(*roster)) {
		return false;
	}

	vector<long long> flightIds;
	if (!_courseCodeMatch.Match(*roster, flightIds)) {
		return false;
	}
	
	if (!MatchTrainingRole(roster, nullptr)) {
		return false;
	}
	return true;
}

bool CheckRenewCertInAdvanceForEvaFdRuleParam::MatchParam(const Segment* segment, const ROSTER* roster, const std::shared_ptr<CREW>& crew) const {
	if (!_assignmentsMatch.Match(*segment)) {
		return false;
	}

	vector<long long> flightIds;
	flightIds.emplace_back(segment->getDBId());
	if (!_courseCodeMatch.Match(*roster, flightIds)) {
		return false;
	}

	if (!MatchTrainingRole(roster, segment)) {
		return false;
	}

	return true;
}

//检查安排任务是否需要跳过国家法定节假日
bool CheckRenewCertInAdvanceForEvaFdRuleParam::CheckHoliday(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const {
	return CheckHoliday(roster->actStrUtc, roster->actRestStrUtc, crew);
}

bool CheckRenewCertInAdvanceForEvaFdRuleParam::CheckHoliday(const Segment* segment, const std::shared_ptr<CREW>& crew) const {
	return CheckHoliday(segment->getStartTimeUtcAct(), segment->getEndTimeUtcAct(), crew);
}

bool CheckRenewCertInAdvanceForEvaFdRuleParam::CheckHoliday(const time_t startTimeUtc, const time_t endTimeUtc, const std::shared_ptr<CREW>& crew) const {
	if (!this->_isSkipHoliday) {
		return true;
	}
	bool valid = true;
	auto& dbData = this->GetRule()->GetDataContext();
	for (auto& holiday : dbData->holidays) {
		if (!_holidayCountriesMatch.Match(holiday->country)) {
			continue;
		}
		if (TimeUtils::IsAbsoluteTimesCovered(startTimeUtc, endTimeUtc, holiday->strDtUtc, holiday->endDtUtc)) {
			valid = false;
			break;
		}
	}
	return valid;
}

//检查安排任务是否必须安排在每周工作日
bool CheckRenewCertInAdvanceForEvaFdRuleParam::CheckWeekDay(const ROSTER* roster, const std::shared_ptr<CREW>& crew) const {
	return CheckWeekDay(roster->actStrUtc, roster->actRestStrUtc, crew);
}

bool CheckRenewCertInAdvanceForEvaFdRuleParam::CheckWeekDay(const Segment* segment, const std::shared_ptr<CREW>& crew) const {
	return CheckWeekDay(segment->getStartTimeUtcAct(), segment->getEndTimeUtcAct(), crew);
}

bool CheckRenewCertInAdvanceForEvaFdRuleParam::CheckWeekDay(const time_t startTimeUtc, const time_t endTimeUtc, const std::shared_ptr<CREW>& crew) const {
	auto& dbData = this->GetRule()->GetDataContext();
	int offsetTZMinutes = RosterUtils::GetTimeZoneOffset(startTimeUtc, crew, dbData);

	time_t startTimeLoc = startTimeUtc + (time_t)offsetTZMinutes * 60;
	time_t endTimeLoc = endTimeUtc + (time_t)offsetTZMinutes * 60;
	int dayNum = TimeUtils::DiffCalendarDay(startTimeLoc, endTimeLoc);
	for (int i = 0; i < dayNum; i++) {
		time_t currTimeLoc = startTimeLoc + (time_t)i * 24 * 60 * 60;
		if (currTimeLoc > endTimeLoc) {
			currTimeLoc = endTimeLoc;
		}
		bool valid = false;
		for (auto& type : this->_types) {
			if (type == "WD") {
				valid = TimeUtils::IsWeekday(currTimeLoc);
			}
			if (!valid && type == "WE") {
				valid = TimeUtils::IsWeekend(currTimeLoc);
			}
		}
		if (!valid) {
			return false;
		}
	}
	return true;
}

bool CheckRenewCertInAdvanceForEvaFdRuleParam::CheckNoAssignment(const vector<const ROSTER*>& rosters, const std::shared_ptr<CREW>& crew) const {

	for (const auto& roster : rosters) {
		if (roster->pairing == nullptr) {
			if (MatchParam(roster, crew)) {
				return true;
			}
		}
		else {
			for (const auto& segment : roster->pairing->getSegmentsRead()) {
				if (MatchParam(segment, roster, crew)) {
					return true;
				}
			}
		}
	}
	return false;
}