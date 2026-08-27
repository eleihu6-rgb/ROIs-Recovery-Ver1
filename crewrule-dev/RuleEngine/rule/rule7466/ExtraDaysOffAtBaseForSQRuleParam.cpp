/**
 * @file ExtraDaysOffAtBaseForSQRuleParam.cpp
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-25
**/

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <limits>
#include <map>
#include <sstream>

#include "ExtraDaysOffAtBaseForSQRuleParam.h"
#include "Log/Logger.h"
#include "StringUtil.h"
#include "UtilFunc.h"

#include "../framework/utils/DutyUtils.h"
#include "../framework/utils/TimeUtils.h"
#include "../framework/constant/Constants.h"

using namespace std;

namespace {
bool isAllToken(const std::string& valueUpper) {
	return valueUpper.empty() || valueUpper == "*" || valueUpper == RuleParamConstant::ALL ||
	       valueUpper == RuleParamConstant::IGNORED || valueUpper == RuleParamConstant::IGNORED_2;
}

bool tryParseIntegerToken(const std::string& token, long long& outValue) {
	if (token.empty()) {
		return false;
	}
	if (!std::all_of(token.begin(),
	                 token.end(),
	                 [](unsigned char c) { return std::isdigit(c) != 0; })) {
		return false;
	}
	outValue = std::atoll(token.c_str());
	return true;
}

std::vector<std::string> splitPipeUpper(const std::string& value) {
	std::vector<std::string> out;
	const std::string trimmed = trim(value);
	if (trimmed.empty()) {
		return out;
	}
	std::vector<std::string> parts;
	split(trimmed.c_str(), '|', parts);
	for (auto& p : parts) {
		const std::string token = strToUpper(trim(p));
		if (!token.empty()) {
			out.push_back(token);
		}
	}
	return out;
}

bool matchWildcardPattern(const std::string& patternUpper, const std::string& valueUpper) {
	if (patternUpper == "*") {
		return true;
	}
	std::size_t p = 0;
	std::size_t v = 0;
	std::size_t star = std::string::npos;
	std::size_t match = 0;
	while (v < valueUpper.size()) {
		if (p < patternUpper.size() && patternUpper[p] == valueUpper[v]) {
			++p;
			++v;
			continue;
		}
		if (p < patternUpper.size() && patternUpper[p] == '*') {
			star = p;
			match = v;
			++p;
			continue;
		}
		if (star != std::string::npos) {
			p = star + 1;
			++match;
			v = match;
			continue;
		}
		return false;
	}
	while (p < patternUpper.size() && patternUpper[p] == '*') {
		++p;
	}
	return p == patternUpper.size();
}

int normalizeDow(int wday) {
	if (wday == 0) {
		return 7;
	}
	return wday;
}

int getDutyDropoffMinutes(const Duty& duty) {
	int dropoff = duty.getActualDropoffMin();
	if (dropoff <= 0) {
		dropoff = duty.getMinDropoff();
	}
	return dropoff < 0 ? 0 : dropoff;
}

bool isDebriefBased(Exdo7466RestStartsAfter startsAfter) {
	return startsAfter != Exdo7466RestStartsAfter::Transport;
}

time_t getRestStartLocAfterDuty(const Duty& duty, Exdo7466RestStartsAfter startsAfter) {
	const time_t endLoc = duty.getEndTimeLocAct();
	if (endLoc <= 0) {
		return 0;
	}
	if (isDebriefBased(startsAfter)) {
		auto debrief = duty.getLastDebrief();
		if (debrief != nullptr && debrief->getEndTimeLocAct() > 0) {
			return debrief->getEndTimeLocAct();
		}
		return endLoc;
	}
	auto dropoff = duty.getLastDropoff();
	if (dropoff != nullptr && dropoff->getEndTimeLocAct() > 0) {
		return dropoff->getEndTimeLocAct();
	}
	const int dropoffMin = getDutyDropoffMinutes(duty);
	return endLoc + static_cast<time_t>(dropoffMin) * 60;
}

time_t getRestEndLocBeforeDuty(const Duty& duty) {
	return duty.getStartTimeLocAct();
}

time_t getRestStartUtcAfterDuty(const Duty& duty, Exdo7466RestStartsAfter startsAfter) {
	const time_t endUtc = duty.getEndTimeUtcAct();
	if (endUtc <= 0) {
		return 0;
	}
	if (isDebriefBased(startsAfter)) {
		auto debrief = duty.getLastDebrief();
		if (debrief != nullptr && debrief->getEndTimeUtcAct() > 0) {
			return debrief->getEndTimeUtcAct();
		}
		return endUtc;
	}
	auto dropoff = duty.getLastDropoff();
	if (dropoff != nullptr && dropoff->getEndTimeUtcAct() > 0) {
		return dropoff->getEndTimeUtcAct();
	}
	const int dropoffMin = getDutyDropoffMinutes(duty);
	return endUtc + static_cast<time_t>(dropoffMin) * 60;
}

time_t getRestEndUtcBeforeDuty(const Duty& duty) {
	return duty.getStartTimeUtcAct();
}

int getDutyEndOffsetMinutes(const Duty& duty) {
	const time_t endLoc = duty.getEndTimeLocAct();
	const time_t endUtc = duty.getEndTimeUtcAct();
	return static_cast<int>((endLoc - endUtc) / 60);
}

int getDutyStartOffsetMinutes(const Duty& duty) {
	const time_t startLoc = duty.getStartTimeLocAct();
	const time_t startUtc = duty.getStartTimeUtcAct();
	return static_cast<int>((startLoc - startUtc) / 60);
}

std::string getRestZoneId(const Duty* arriveDuty,
                          const Duty* departDuty,
                          const CrewDataContext* dbData) {
	if (dbData == nullptr) {
		return {};
	}
	if (departDuty != nullptr) {
		const std::string depZoneId = dbData->getAirportZoneId(departDuty->getDepartureStation());
		if (!depZoneId.empty()) {
			return depZoneId;
		}
	}
	if (arriveDuty != nullptr) {
		return dbData->getAirportZoneId(arriveDuty->getArrivalStation());
	}
	return {};
}

int getLocalNightNumsForRestWindow(const Duty* arriveDuty,
                                   const Duty* departDuty,
                                   const Exdo7466ControlParam& control,
                                   const CrewDataContext* dbData,
                                   time_t fallbackStartLoc,
                                   time_t fallbackEndLoc) {

	const time_t restStartUtc = getRestStartUtcAfterDuty(*arriveDuty, control.restStartsAfter);
	const time_t restEndUtc = getRestEndUtcBeforeDuty(*departDuty);
	const std::string zoneId = getRestZoneId(arriveDuty, departDuty, dbData);
	if (restStartUtc <= 0 || restEndUtc <= restStartUtc || zoneId.empty()) {
		return 0;
	}

	// Pragmatic shortcut: use duty endpoint local/UTC deltas as the DST detector.
	// Rare limitation: if the effective rest boundary shifts across a DST transition because of
	// dropoff/debrief adjustments, the detector may miss that edge case.
	const int startOffsetMinutes = getDutyEndOffsetMinutes(*arriveDuty);
	const int endOffsetMinutes = getDutyStartOffsetMinutes(*departDuty);
	return DutyUtils::GetLocalNightNums(restStartUtc, restEndUtc, startOffsetMinutes, endOffsetMinutes, zoneId);
}

bool isOperatingDutyAssignment(const Duty& duty) {
	const std::string assignment = duty.getAssignment();
	return assignment == "FLY" || assignment == "MVO";
}

bool isOperatingSegmentFor7466(const Segment& segment) {
	const std::string assignment = strToUpper(segment.getAssignment());
	if (assignment == "FLY" || assignment == "MVO" || assignment == "OPR") {
		return true;
	}
	return segment.getIsOperating();
}

bool isStandbyAssignment(const Duty& duty, const Exdo7466ControlParam& control) {
	if (control.standbyAssignmentsUpper.empty()) {
		return false;
	}
	const std::string assignment = duty.getAssignment();
	return std::find(control.standbyAssignmentsUpper.begin(),
	                 control.standbyAssignmentsUpper.end(),
	                 assignment) != control.standbyAssignmentsUpper.end();
}

struct StationChainWithDutyIndex {
	std::vector<std::string> chain;
	std::vector<std::size_t> arriveDutyIndex;
};

StationChainWithDutyIndex buildStationChainWithDutyIndex(const std::vector<Duty*>& duties) {
	StationChainWithDutyIndex out;
	if (duties.empty()) {
		return out;
	}

	std::size_t firstIndex = duties.size();
	for (std::size_t i = 0; i < duties.size(); ++i) {
		if (duties[i] != nullptr) {
			firstIndex = i;
			break;
		}
	}
	if (firstIndex >= duties.size() || duties[firstIndex] == nullptr) {
		return out;
	}

	out.chain.push_back(duties[firstIndex]->getDepartureStation());
	out.arriveDutyIndex.push_back(std::numeric_limits<std::size_t>::max());

	for (std::size_t i = firstIndex; i < duties.size(); ++i) {
		const Duty* d = duties[i];
		if (d == nullptr) {
			continue;
		}
		const std::string arr = d->getArrivalStation();
		if (out.chain.empty() || out.chain.back() != arr) {
			out.chain.push_back(arr);
			out.arriveDutyIndex.push_back(i);
		}
	}
	return out;
}

int calcSlipLocalNights(const std::vector<Duty*>& duties,
                        std::size_t arriveDutyIndex,
                        std::size_t departDutyIndex,
                        const Exdo7466ControlParam& control,
                        const CrewDataContext* dbData) {
	if (arriveDutyIndex >= duties.size() || departDutyIndex >= duties.size() || departDutyIndex <= arriveDutyIndex) {
		return 0;
	}
	const Duty* arriveDuty = duties[arriveDutyIndex];
	const Duty* departDuty = duties[departDutyIndex];
	if (arriveDuty == nullptr || departDuty == nullptr) {
		return 0;
	}

	const time_t slipStartLoc = getRestStartLocAfterDuty(*arriveDuty, control.restStartsAfter);
	const time_t slipEndLoc = getRestEndLocBeforeDuty(*departDuty);
	if (slipStartLoc <= 0 || slipEndLoc <= 0 || slipEndLoc <= slipStartLoc) {
		return 0;
	}

	if (!control.standbyReducesRestAndLocalNight) {
		return getLocalNightNumsForRestWindow(arriveDuty, departDuty, control, dbData, slipStartLoc, slipEndLoc);
	}

	time_t restStartLoc = slipStartLoc;
	int localNights = 0;
	const Duty* restStartDuty = arriveDuty;
	for (std::size_t k = arriveDutyIndex + 1; k < departDutyIndex; ++k) {
		const Duty* d = duties[k];
		if (d == nullptr || !isStandbyAssignment(*d, control)) {
			continue;
		}
		const time_t standbyStartLoc = getRestEndLocBeforeDuty(*d);
		if (standbyStartLoc > restStartLoc) {
			localNights += getLocalNightNumsForRestWindow(restStartDuty, d, control, dbData, restStartLoc, standbyStartLoc);
		}
		restStartLoc = getRestStartLocAfterDuty(*d, control.restStartsAfter);
		restStartDuty = d;
		if (restStartLoc <= 0) {
			restStartLoc = standbyStartLoc;
		}
	}
	if (slipEndLoc > restStartLoc && restStartLoc > 0) {
		localNights += getLocalNightNumsForRestWindow(restStartDuty, departDuty, control, dbData, restStartLoc, slipEndLoc);
	}
	return localNights;
}
}  // namespace

Exdo7466SlipOperatingRequirement ExtraDaysOffAtBaseForSQRuleParam::ParseSlipOperatingRequirement(const std::string& value) {
	const std::string upper = strToUpper(trim(value));
	long long numeric = 0;
	if (tryParseIntegerToken(upper, numeric)) {
		return numeric == 0 ? Exdo7466SlipOperatingRequirement::NonOperate
		                    : Exdo7466SlipOperatingRequirement::Operate;
	}
	if (isAllToken(upper) || upper == "ANY") {
		return Exdo7466SlipOperatingRequirement::Any;
	}
	if (upper == "Y" || upper == "YES" || upper == "TRUE" || upper == "1" ||
	    upper == "OPERATE" || upper == "OPERATING") {
		return Exdo7466SlipOperatingRequirement::Operate;
	}
	if (upper == "N" || upper == "NO" || upper == "FALSE" || upper == "0" ||
	    upper == "NONOPERATE" || upper == "NON_OPERATE" || upper == "NON-OPERATE" ||
	    upper == "NONOPERATING" || upper == "NON_OPERATING" || upper == "NON-OPERATING") {
		return Exdo7466SlipOperatingRequirement::NonOperate;
	}
	return Exdo7466SlipOperatingRequirement::Any;
}

Exdo7466FlightOperatingRequirement ExtraDaysOffAtBaseForSQRuleParam::ParseFlightOperatingRequirement(const std::string& value) {
	const std::string upper = strToUpper(trim(value));
	long long numeric = 0;
	if (tryParseIntegerToken(upper, numeric)) {
		return numeric == 0 ? Exdo7466FlightOperatingRequirement::NonOperate
		                    : Exdo7466FlightOperatingRequirement::Operate;
	}
	if (isAllToken(upper) || upper == "ANY") {
		return Exdo7466FlightOperatingRequirement::Any;
	}
	if (upper == "Y" || upper == "YES" || upper == "TRUE" || upper == "1" ||
	    upper == "OPERATE" || upper == "OPERATING") {
		return Exdo7466FlightOperatingRequirement::Operate;
	}
	if (upper == "N" || upper == "NO" || upper == "FALSE" || upper == "0" ||
	    upper == "NONOPERATE" || upper == "NON_OPERATE" || upper == "NON-OPERATE" ||
	    upper == "NONOPERATING" || upper == "NON_OPERATING" || upper == "NON-OPERATING" ||
	    upper == "DHD" || upper == "DEADHEAD" || upper == "POSITIONING" ||
	    upper == "POSITIONING/DEADHEADING") {
		return Exdo7466FlightOperatingRequirement::NonOperate;
	}
	return Exdo7466FlightOperatingRequirement::Any;
}

bool ExtraDaysOffAtBaseForSQRuleParam::ParseRange(const std::string& value, int& lower, int& upper) {
	const std::string trimmed = trim(value);
	const std::string upperValue = strToUpper(trimmed);
	if (isAllToken(upperValue)) {
		return false;
	}
	const auto dashPos = trimmed.find('-');
	if (dashPos == std::string::npos) {
		const int parsed = atoi(trimmed.c_str());
		lower = parsed;
		upper = parsed;
		return true;
	}
	const std::string startStr = trim(trimmed.substr(0, dashPos));
	const std::string endStr = trim(trimmed.substr(dashPos + 1));
	lower = atoi(startStr.c_str());
	upper = atoi(endStr.c_str());
	if (lower > upper) {
		std::swap(lower, upper);
	}
	return true;
}

void ExtraDaysOffAtBaseForSQRuleParam::ParseParam(const std::string& paramString) {
	std::stringstream ss(paramString);
	for (int i = 0; i < totalNumParam; ++i) {
		std::string substr;
		std::getline(ss, substr, delimInParam);
		if (substr.empty()) {
			continue;
		}
		switch (i + 1) {
		case enum_to_underlying(ParamLocation::SLIP_STATION): {
			_slipStationRaw = substr;
			const std::string trimmed = trim(substr);
			_slipStation = LocationExpr::Parse(trimmed.empty() ? "*" : trimmed);
			break;
		}
		case enum_to_underlying(ParamLocation::SLIP_ARR_IS_OPERATING): {
			_slipArrIsOperatingRequirement = ParseSlipOperatingRequirement(substr);
			break;
		}
		case enum_to_underlying(ParamLocation::SLIP_DEP_IS_OPERATING): {
			_slipDepIsOperatingRequirement = ParseSlipOperatingRequirement(substr);
			break;
		}
		case enum_to_underlying(ParamLocation::SLIP_LOCAL_NIGHT_RANGE): {
			_slipLocalNightRange = substr;
			_hasSlipLocalNightRange = ParseRange(substr, _slipLocalNightLower, _slipLocalNightUpper);
			break;
		}
		case enum_to_underlying(ParamLocation::COP_START_DOW): {
			_copStartDowRange = substr;
			_hasCopStartDowRange = ParseRange(substr, _copStartDowLower, _copStartDowUpper);
			break;
		}
		case enum_to_underlying(ParamLocation::FLIGHT_NUMBERS): {
			const std::string upper = strToUpper(trim(substr));
			if (!isAllToken(upper)) {
				_flightNumberPatternsUpper = splitPipeUpper(substr);
			} else {
				_flightNumberPatternsUpper.clear();
			}
			break;
		}
		case enum_to_underlying(ParamLocation::FLIGHT_IS_OPERATING): {
			_flightIsOperatingRequirement = ParseFlightOperatingRequirement(substr);
			break;
		}
		case enum_to_underlying(ParamLocation::PERIOD_START_DATE): {
			_strPeriodStartDate = substr;
			_periodStartDateLoc = utcStrToUtc((char*)substr.c_str());
			break;
		}
		case enum_to_underlying(ParamLocation::PERIOD_END_DATE): {
			_strPeriodEndDate = substr;
			_periodEndDateLoc = utcStrToUtc((char*)substr.c_str());
			break;
		}
		case enum_to_underlying(ParamLocation::EXTRA_DAYS_OFF): {
			_extraDaysOff = atoi(substr.c_str());
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

void ExtraDaysOffAtBaseForSQRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;

	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++) {
		header = iter->first;
		headeValue = iter->second;
		const string headerUpper = strToUpper(trim(header));

		if (headerUpper == "SLIP STATION") {
			_slipStationRaw = headeValue;
			const std::string trimmed = trim(headeValue);
			_slipStation = LocationExpr::Parse(trimmed.empty() ? "*" : trimmed);
		} else if (headerUpper == "SLIP ARR IS OPERATING" ||
		           headerUpper == "SLIP ARRIVAL IS OPERATING" ||
		           headerUpper == "SLIP ARRIVAL DUTY IS OPERATING") {
			_slipArrIsOperatingRequirement = ParseSlipOperatingRequirement(headeValue);
		} else if (headerUpper == "SLIP DEP IS OPERATING" ||
		           headerUpper == "SLIP DEPARTURE IS OPERATING" ||
		           headerUpper == "SLIP DEPARTURE DUTY IS OPERATING") {
			_slipDepIsOperatingRequirement = ParseSlipOperatingRequirement(headeValue);
		} else if (headerUpper == "SLIP LOCAL NIGHT RANGE" ||
		           headerUpper == "SLIP LOCAL NIGHT" ||
		           headerUpper == "SLIP LOCAL NIGHTS") {
			_slipLocalNightRange = headeValue;
			_hasSlipLocalNightRange = ParseRange(headeValue, _slipLocalNightLower, _slipLocalNightUpper);
		} else if (headerUpper == "COP START DOW" ||
		           headerUpper == "COP START DAY OF WEEK" ||
		           headerUpper == "COP START DOW RANGE") {
			_copStartDowRange = headeValue;
			_hasCopStartDowRange = ParseRange(headeValue, _copStartDowLower, _copStartDowUpper);
		} else if (headerUpper == "FLIGHT NUMBERS") {
			const std::string upper = strToUpper(trim(headeValue));
			if (!isAllToken(upper)) {
				_flightNumberPatternsUpper = splitPipeUpper(headeValue);
			} else {
				_flightNumberPatternsUpper.clear();
			}
		} else if (headerUpper == "FLIGHT IS OPERATING" ||
		           headerUpper == "FLIGHT IN IS OPERATING" ||
		           headerUpper == "FLIGHT OPERATING") {
			_flightIsOperatingRequirement = ParseFlightOperatingRequirement(headeValue);
		} else if (headerUpper == "PERIOD START DATE") {
			_strPeriodStartDate = headeValue;
			_periodStartDateLoc = utcStrToUtc((char*)headeValue.c_str());
		} else if (headerUpper == "PERIOD END DATE") {
			_strPeriodEndDate = headeValue;
			_periodEndDateLoc = utcStrToUtc((char*)headeValue.c_str());
		} else if (headerUpper == "EXTRA DAYS OFF") {
			_extraDaysOff = atoi(headeValue.c_str());
		} else if (headerUpper == "SEVERITY") {
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		} else {
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}",
			                               dbRule.idRule, dbRule.idRuleParam, header);
		}
	}
}

bool ExtraDaysOffAtBaseForSQRuleParam::MatchCopStartDow(const Pairing* pairing) const {
	if (!_hasCopStartDowRange) {
		return true;
	}
	if (pairing == nullptr) {
		return false;
	}
	time_t startLoc = pairing->getStartTimeLocAct();
	if (startLoc <= 0) {
		startLoc = pairing->getStartTimeUtcAct();
	}
	if (startLoc <= 0) {
		return false;
	}
	const int dow = normalizeDow(TimeUtils::GetDayOfWeekend(startLoc));
	return dow >= _copStartDowLower && dow <= _copStartDowUpper;
}

bool ExtraDaysOffAtBaseForSQRuleParam::MatchFlightNumbers(const Pairing* pairing) const {
	if (_flightNumberPatternsUpper.empty()) {
		return true;
	}
	if (pairing == nullptr) {
		return false;
	}
	for (auto& duty : pairing->getDutyVec()) {
		if (duty == nullptr) {
			continue;
		}
		for (auto& segment : duty->getSegmentsRead()) {
			if (segment == nullptr) {
				continue;
			}
			const bool isOperating = isOperatingSegmentFor7466(*segment);
			if (_flightIsOperatingRequirement == Exdo7466FlightOperatingRequirement::Operate && !isOperating) {
				continue;
			}
			if (_flightIsOperatingRequirement == Exdo7466FlightOperatingRequirement::NonOperate && isOperating) {
				continue;
			}
			const std::string& flightNumber = segment->getFlightNumber();
			for (const auto& pattern : _flightNumberPatternsUpper) {
				if (matchWildcardPattern(pattern, flightNumber)) {
					return true;
				}
			}
		}
	}
	return false;
}

bool ExtraDaysOffAtBaseForSQRuleParam::MatchPeriod(const Pairing* pairing) const {
	if (pairing == nullptr) {
		return false;
	}
	time_t pairingStartLoc = 0;
	int offsetTZInSecs = 0;
	const Duty* firstDuty = pairing->getFirstDuty();
	if (firstDuty == nullptr) {
		for (auto duty : pairing->getDutyVec()) {
			if (duty != nullptr) {
				firstDuty = duty;
				break;
			}
		}
	}
	if (firstDuty != nullptr) {
		const auto& firstBrief = firstDuty->getFirstBreif();
		if (firstBrief != nullptr) {
			if (firstBrief->getStartTimeLocAct() > 0) {
				pairingStartLoc = firstBrief->getStartTimeLocAct();
			} else if (firstBrief->getStartLoc() > 0) {
				pairingStartLoc = firstBrief->getStartLoc();
			}
		}
		if (pairingStartLoc <= 0) {
			if (firstDuty->getStartTimeLocAct() > 0 && firstDuty->getStartTimeUtcAct() > 0) {
				offsetTZInSecs = static_cast<int>(firstDuty->getStartTimeLocAct() - firstDuty->getStartTimeUtcAct());
			}
			pairingStartLoc = firstDuty->getStartTimeLocAct();
			if (pairingStartLoc <= 0 && firstDuty->getStartTimeUtcAct() > 0) {
				pairingStartLoc = firstDuty->getStartTimeUtcAct() + (time_t)offsetTZInSecs;
			}
		}
	}
	if (pairingStartLoc <= 0) {
		if (pairing->getStartTimeLocAct() > 0 && pairing->getStartTimeUtcAct() > 0) {
			offsetTZInSecs = static_cast<int>(pairing->getStartTimeLocAct() - pairing->getStartTimeUtcAct());
		}
		pairingStartLoc = pairing->getStartTimeLocAct();
		if (pairingStartLoc <= 0) {
			pairingStartLoc = pairing->getStartTimeUtcAct() + (time_t)offsetTZInSecs;
		}
	}
	if (pairingStartLoc <= 0) {
		return false;
	}
	return this->_periodStartDateLoc <= pairingStartLoc && pairingStartLoc <= this->_periodEndDateLoc;
}

bool ExtraDaysOffAtBaseForSQRuleParam::MatchSlip(const Pairing* pairing,
                                                const Exdo7466ControlParam& control,
                                                const CrewDataContext* dbData) const {
	if (pairing == nullptr) {
		return false;
	}
	const auto& duties = pairing->getDutyVec();
	if (duties.size() < 2) {
		return false;
	}
	const StationChainWithDutyIndex chain = buildStationChainWithDutyIndex(duties);
	if (chain.chain.empty() || chain.arriveDutyIndex.size() != chain.chain.size()) {
		return false;
	}

	const bool slipStationAny = (_slipStation.type == LocationMatchUtils::LocationExpr::Type::Any);

	if (chain.chain.size() <= 1) {
		for (std::size_t i = 0; i + 1 < duties.size(); ++i) {
			const Duty* arriveDuty = duties[i];
			const Duty* departDuty = duties[i + 1];
			if (arriveDuty == nullptr || departDuty == nullptr) {
				continue;
			}
			const std::string station = arriveDuty->getArrivalStation();
			if (!slipStationAny && !_slipStation.MatchesAirport(station, dbData)) {
				continue;
			}
			if (departDuty->getDepartureStation() != station) {
				continue;
			}

			const bool arrOperating = isOperatingDutyAssignment(*arriveDuty);
			const bool depOperating = isOperatingDutyAssignment(*departDuty);
			if (_slipArrIsOperatingRequirement != Exdo7466SlipOperatingRequirement::Any) {
				if (_slipArrIsOperatingRequirement == Exdo7466SlipOperatingRequirement::Operate && !arrOperating) {
					continue;
				}
				if (_slipArrIsOperatingRequirement == Exdo7466SlipOperatingRequirement::NonOperate && arrOperating) {
					continue;
				}
			}
			if (_slipDepIsOperatingRequirement != Exdo7466SlipOperatingRequirement::Any) {
				if (_slipDepIsOperatingRequirement == Exdo7466SlipOperatingRequirement::Operate && !depOperating) {
					continue;
				}
				if (_slipDepIsOperatingRequirement == Exdo7466SlipOperatingRequirement::NonOperate && depOperating) {
					continue;
				}
			}
			if (_hasSlipLocalNightRange) {
				const int slipLocalNights = calcSlipLocalNights(duties, i, i + 1, control, dbData);
				if (slipLocalNights < _slipLocalNightLower || slipLocalNights > _slipLocalNightUpper) {
					continue;
				}
			}
			return true;
		}
		return false;
	}

	for (std::size_t i = 1; i + 1 < chain.chain.size(); ++i) {
		if (!slipStationAny && !_slipStation.MatchesAirport(chain.chain[i], dbData)) {
			continue;
		}
		const std::size_t arriveDutyIndex = chain.arriveDutyIndex[i];
		const std::size_t departDutyIndex = chain.arriveDutyIndex[i + 1];
		if (arriveDutyIndex >= duties.size() || departDutyIndex >= duties.size() || departDutyIndex <= arriveDutyIndex) {
			continue;
		}
		const Duty* arriveDuty = duties[arriveDutyIndex];
		const Duty* departDuty = duties[departDutyIndex];
		if (arriveDuty == nullptr || departDuty == nullptr) {
			continue;
		}

		const bool arrOperating = isOperatingDutyAssignment(*arriveDuty);
		const bool depOperating = isOperatingDutyAssignment(*departDuty);
		if (_slipArrIsOperatingRequirement != Exdo7466SlipOperatingRequirement::Any) {
			if (_slipArrIsOperatingRequirement == Exdo7466SlipOperatingRequirement::Operate && !arrOperating) {
				continue;
			}
			if (_slipArrIsOperatingRequirement == Exdo7466SlipOperatingRequirement::NonOperate && arrOperating) {
				continue;
			}
		}
		if (_slipDepIsOperatingRequirement != Exdo7466SlipOperatingRequirement::Any) {
			if (_slipDepIsOperatingRequirement == Exdo7466SlipOperatingRequirement::Operate && !depOperating) {
				continue;
			}
			if (_slipDepIsOperatingRequirement == Exdo7466SlipOperatingRequirement::NonOperate && depOperating) {
				continue;
			}
		}

		if (_hasSlipLocalNightRange) {
			const int slipLocalNights = calcSlipLocalNights(duties, arriveDutyIndex, departDutyIndex, control, dbData);
			if (slipLocalNights < _slipLocalNightLower || slipLocalNights > _slipLocalNightUpper) {
				continue;
			}
		}

		return true;
	}
	return false;
}

bool ExtraDaysOffAtBaseForSQRuleParam::MatchParam(const Pairing* pairing,
                                                 const Exdo7466ControlParam& control,
                                                 const CrewDataContext* dbData) const {
	if (!MatchCopStartDow(pairing)) {
		return false;
	}
	if (!MatchFlightNumbers(pairing)) {
		return false;
	}
	if (!MatchPeriod(pairing)) {
		return false;
	}
	if (!MatchSlip(pairing, control, dbData)) {
		return false;
	}
	return true;
}
