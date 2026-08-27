/**
 * @file CalculateSplitDutyMaxFdpExtensionForTGRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <algorithm>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CalculateSplitDutyMaxFdpExtensionForTGRuleParam.h"
#include "CrewDB.h"
#include "../utils/BaseUtils.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../constant/Constants.h"

using namespace std;

void CalculateSplitDutyMaxFdpExtensionForTGRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		//Segment Assignments,Duty by Flight Numbers,Duty Rest Range in Flight,Rest Facilty,FT Offset per Segment,FT Discount Divisor,Max FDP
		if (header == "POST FLIGHT ASSIGNMENTS") {
			_postFlightAssignments = headeValue;
			_postFlightAssignmentsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "PRE FLIGHT ASSIGNMENTS") {
			_preFlightAssignments = headeValue;
			_preFlightAssignmentsMatch.SetExpression(headeValue, this->GetRule());
		}
		else if (header == "DUMMY RELEASE TIME") {
			_dummyReleaseTime = headeValue;
			if (!_dummyReleaseTime.empty() || _dummyReleaseTime != "*")
				_dummyReleaseTimeMinutes = hhmmStrToMinutes(headeValue);
			else
				_dummyReleaseTimeMinutes = 0;
		}
		else if (header == "DUMMY BRIEF TIME") {
			_dummyBriefTime = headeValue;
			if (!_dummyBriefTime.empty() || _dummyBriefTime != "*")
				_dummyBriefTimeMinutes = hhmmStrToMinutes(headeValue);
			else
				_dummyBriefTimeMinutes = 0;
		}
		else if (header == "TOTAL HOTEL TRAVEL TIME") {
			_travelTimeToFromHotel = headeValue;
			if (!_travelTimeToFromHotel.empty() || _travelTimeToFromHotel != "*")
				_travelTimeToFromHotelMinutes = hhmmStrToMinutes(headeValue);
			else
				_travelTimeToFromHotelMinutes = 0;
		}
		else if (header == "MIN SPLIT DUTY LENGTH") {
			_minSplitDutyLength = headeValue;
			if (!_minSplitDutyLength.empty() || _minSplitDutyLength != "*")
				_minSplitDutyLengthMinutes = hhmmStrToMinutes(headeValue);
			else
				_minSplitDutyLengthMinutes = 0;
		}
		else if (header == "MAX SPLIT DUTY LENGTH") {
			_maxSplitDutyLength = headeValue;
			if (!_maxSplitDutyLength.empty() || _maxSplitDutyLength != "*")
				_maxSplitDutyLengthMinutes = hhmmStrToMinutes(headeValue);
			else
				_maxSplitDutyLengthMinutes = 0;
		}
		else if (header == "EXTENSION MAX FDP PCT") {
			_extensionMaxFdpPct = headeValue;
			if (!_extensionMaxFdpPct.empty() || _extensionMaxFdpPct != "*")
				_extensionMaxFdpPctValue = stod(headeValue);
			else
				_extensionMaxFdpPctValue = 0.0;
		}
		else if (header == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CalculateSplitDutyMaxFdpExtensionForTGRuleParam::MatchPostFlight(const Segment& segment) const {
	if (!_postFlightAssignmentsMatch.Match(segment))
		return false;
	return true;
}

bool CalculateSplitDutyMaxFdpExtensionForTGRuleParam::MatchPreFlight(const Segment& segment) const {
	if (!_preFlightAssignmentsMatch.Match(segment))
		return false;
	return true;
}

//匹配规则参数是否满足
bool CalculateSplitDutyMaxFdpExtensionForTGRuleParam::MatchParam(const Segment& postSegment, const Segment& preSegment) const {

	if (!MatchPostFlight(postSegment))
		return false;

	if (!MatchPreFlight(preSegment))
		return false;
	
	return true;
}

int CalculateSplitDutyMaxFdpExtensionForTGRuleParam::GetExtensionMaxFdpMinutes(const time_t start, const time_t end) const {
	if (end < start)
		return 0;

	int splitDutyMinutes = max(_maxSplitDutyLengthMinutes, (int)(end - start) / 60);

	return splitDutyMinutes * _extensionMaxFdpPctValue;

}