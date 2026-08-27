/**
 * @file MinScheDaysOffAtBaseForSQRuleParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2025-12-25
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "MinScheDaysOffAtBaseForSQRuleParam.h"
#include "CrewDB.h"
#include "StringUtil.h"
#include "../utils/SegmentUtils.h"
#include "../utils/TimeUtils.h"
#include "../constant/Constants.h"

#include "RuleParams.h"

using namespace std;

namespace {
std::string ResolveSegmentServiceTypeUpper(const Segment* segment, const SharedPtr<CrewDataContext>& dbData) {
	std::string value = segment->getServiceType();
	if (value.empty()) {
		auto flight = SegmentUtils::GetFlightBySegment(segment, dbData);
		if (flight != nullptr) {
			value = flight->getServiceType();
		}
	}
	return value;
}

std::string ResolveSegmentFleetCode(const Segment* segment, const SharedPtr<CrewDataContext>& dbData) {
	std::string value = segment->getFleetCD();
	if (value.empty()) {
		auto flight = SegmentUtils::GetFlightBySegment(segment, dbData);
		if (flight != nullptr) {
			value = flight->getFleetCD();
		}
	}
	return value;
}

int getDutyDropoffMinutes(const Duty* duty) {
	if (duty == nullptr) {
		return 0;
	}
	int dropoff = duty->getActualDropoffMin();
	if (dropoff <= 0) {
		dropoff = duty->getMinDropoff();
	}
	return dropoff < 0 ? 0 : dropoff;
}

time_t resolveDutyReportStartLoc(const Duty* duty) {
	if (duty == nullptr) {
		return 0;
	}
	const auto brief = duty->getFirstBreif();
	if (brief != nullptr) {
		if (brief->getStartTimeLocAct() > 0) {
			return brief->getStartTimeLocAct();
		}
		if (brief->getStartTimeLocSch() > 0) {
			return brief->getStartTimeLocSch();
		}
	}
	if (duty->getStartTimeLocAct() > 0) {
		return duty->getStartTimeLocAct();
	}
	return duty->getStartTimeLocSch();
}

time_t resolveDutyDebriefEndLoc(const Duty* duty) {
	if (duty == nullptr) {
		return 0;
	}
	const auto debrief = duty->getLastDebrief();
	if (debrief != nullptr) {
		if (debrief->getEndTimeLocAct() > 0) {
			return debrief->getEndTimeLocAct();
		}
		if (debrief->getEndTimeLocSch() > 0) {
			return debrief->getEndTimeLocSch();
		}
	}
	if (duty->getEndTimeLocAct() > 0) {
		return duty->getEndTimeLocAct();
	}
	return duty->getEndTimeLocSch();
}

time_t resolveDutyTransportEndLoc(const Duty* duty) {
	if (duty == nullptr) {
		return 0;
	}
	const auto dropoff = duty->getLastDropoff();
	if (dropoff != nullptr) {
		if (dropoff->getEndTimeLocAct() > 0) {
			return dropoff->getEndTimeLocAct();
		}
		if (dropoff->getEndTimeLocSch() > 0) {
			return dropoff->getEndTimeLocSch();
		}
	}
	const time_t debriefEndLoc = resolveDutyDebriefEndLoc(duty);
	if (debriefEndLoc <= 0) {
		return 0;
	}
	return debriefEndLoc + static_cast<time_t>(getDutyDropoffMinutes(duty)) * 60;
}
}  // namespace

MinScheDaysOffAtBaseForSQRuleParam::DoStartsAfter
MinScheDaysOffAtBaseForSQRuleParam::ParseDoStartsAfter(const std::string& value) {
	const std::string upper = strToUpper(trim(value));
	if (upper == "DEBRIEF_NXDO" || upper == "DEBRIEF_NEXT_DO") {
		return DoStartsAfter::DebriefNxdo;
	}
	if (upper == "DEBRIEF" || upper == "DEBRIEFING") {
		return DoStartsAfter::Debrief;
	}
	if (upper == "TRANSPORT" || upper == "DROPOFF" || upper == "DROP OFF" || upper == "DROP-OFF") {
		return DoStartsAfter::Transport;
	}
	return DoStartsAfter::Transport;
}

MinScheDaysOffAtBaseForSQRuleParam::PairingLengthEndsAt
MinScheDaysOffAtBaseForSQRuleParam::ParsePairingLengthEndsAt(const std::string& value) {
	const std::string upper = strToUpper(trim(value));
	if (upper == "TRANSPORT" || upper == "DROPOFF" || upper == "DROP OFF" || upper == "DROP-OFF") {
		return PairingLengthEndsAt::Transport;
	}
	if (upper == "DEBRIEF" || upper == "DEBRIEFING") {
		return PairingLengthEndsAt::Debrief;
	}
	return PairingLengthEndsAt::Debrief;
}

void MinScheDaysOffAtBaseForSQRuleParam::ParseParam(const std::string &paramString) {
    std::stringstream ss(paramString);
    for (int i = 0; i < totalNumParam; ++i) {
        std::string substr;
        std::getline(ss, substr, delimInParam);
        if (!substr.empty()) {
            switch (i) {
			case enum_to_underlying(ParamLocation::COP_LENGTH_RANGE): {
				_pairingLengthRange = substr;

				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					vector<string> splitstrs;
					split(substr.c_str(), '-', splitstrs);
					if (splitstrs.size() >= 2) {
						_pairingLengthLower = atoi(splitstrs[0].c_str());
						_pairingLengthUpper = atoi(splitstrs[1].c_str());
					}
				}
				break;
			}
			case enum_to_underlying(ParamLocation::FLEETS): {
				if (!substr.empty() && substr != RuleParamConstant::ALL) {
					split(substr, '|', _flightFleets);
				}
				break;
			}
			case enum_to_underlying(ParamLocation::SERVICE_TYPE): {
				const std::string upper = strToUpper(trim(substr));
				if (upper.empty() || upper == RuleParamConstant::ALL ||
					upper == RuleParamConstant::IGNORED || upper == RuleParamConstant::IGNORED_2) {
					_flightServiceType.clear();
				} else {
					_flightServiceType = upper;
				}
				break;
			}
			case enum_to_underlying(ParamLocation::DO_STARTS_AFTER): {
				_doStartsAfter = ParseDoStartsAfter(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::MIN_DAYS_OFF): {
				_minDaysOff = atoi(substr.c_str());
				break;
			}
			case enum_to_underlying(ParamLocation::PAIRING_LENGTH_ENDS_AT): {
				_pairingLengthEndsAt = ParsePairingLengthEndsAt(substr);
				break;
			}
			case enum_to_underlying(ParamLocation::SEVERITY):
				this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(substr.c_str())));
				break;
			default:
				Logger::getRuleLogger()->error("Rule Param parsing error at rule:{}", RuleFuncId);
            }
        }
    }
}

void MinScheDaysOffAtBaseForSQRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	//COP Length Range,Fleets,Service Type,Do Starts After,Min Days Off
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		const string headerUpper = strToUpper(trim(header));

		if (headerUpper == "COP LENGTH RANGE") {
			_pairingLengthRange = headeValue;
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				vector<string> splitstrs;
				split(headeValue.c_str(), '-', splitstrs);
				if (splitstrs.size() >= 2) {
					_pairingLengthLower = atoi(splitstrs[0].c_str());
					_pairingLengthUpper = atoi(splitstrs[1].c_str());
				}
			}
		}
		else if (headerUpper == "FLEETS") {
			if (!headeValue.empty() && headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _flightFleets);
			}
		}
		else if (headerUpper == "SERVICE TYPE") {
			const std::string upper = strToUpper(trim(headeValue));
			if (upper.empty() || upper == RuleParamConstant::ALL ||
				upper == RuleParamConstant::IGNORED || upper == RuleParamConstant::IGNORED_2) {
				_flightServiceType.clear();
			} else {
				_flightServiceType = upper;
			}
		}
		else if (headerUpper == "DO STARTS AFTER") {
			_doStartsAfter = ParseDoStartsAfter(headeValue);
		}
		else if (headerUpper == "MIN DAYS OFF") {
			_minDaysOff = atoi(headeValue.c_str());
		}
		else if (headerUpper == "PAIRING LENGTH ENDS AT" || headerUpper == "PAIRING ENDS AT") {
			_pairingLengthEndsAt = ParsePairingLengthEndsAt(headeValue);
		}
		else if (headerUpper == "SEVERITY")
			this->SetSeverity(underlying_to_enum<ViolationSeverity>(atoi(headeValue.c_str())));
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool MinScheDaysOffAtBaseForSQRuleParam::MatchPairingLength(const Pairing* pairing) const {
	if (pairing == nullptr || pairing->getDutyVec().empty()) {
		return false;
	}
	const Duty* firstDuty = pairing->getFirstDuty();
	if (firstDuty == nullptr) {
		for (auto duty : pairing->getDutyVec()) {
			if (duty != nullptr) {
				firstDuty = duty;
				break;
			}
		}
	}
	const Duty* lastDuty = pairing->getLastDuty();
	if (lastDuty == nullptr) {
		for (std::size_t i = pairing->getDutyVec().size(); i-- > 0;) {
			if (pairing->getDutyVec()[i] != nullptr) {
				lastDuty = pairing->getDutyVec()[i];
				break;
			}
		}
	}
	if (firstDuty == nullptr || lastDuty == nullptr) {
		return false;
	}

	time_t startTimeLoc = resolveDutyReportStartLoc(firstDuty);
	time_t endTimeLoc = PairingLengthEndsAtDebrief()
		? resolveDutyDebriefEndLoc(lastDuty)
		: resolveDutyTransportEndLoc(lastDuty);
	if (startTimeLoc <= 0 || endTimeLoc <= 0) {
		return false;
	}
	int days = TimeUtils::DiffCalendarDay(startTimeLoc, endTimeLoc);
    return days >= _pairingLengthLower && days <= _pairingLengthUpper;
}

bool MinScheDaysOffAtBaseForSQRuleParam::MatchFlightFleetAndServiceType(const Pairing* pairing) const {
	if (pairing == nullptr) {
		return false;
	}
	const auto& duties = pairing->getDutyVec();
	if (duties.empty()) {
		return false;
	}

	const auto& dbData = this->GetRule()->GetDataContext();

	const std::string pairingServiceType = [&]() -> std::string {
		bool sawOperating = false;
		bool allOperatingAreFreighter = true;
		for (auto* duty : duties) {
			if (duty == nullptr) {
				continue;
			}
			for (auto* seg : duty->getSegmentsRead()) {
				if (seg == nullptr || !seg->getIsOperating()) {
					continue;
				}
				sawOperating = true;
				const std::string serviceType = ResolveSegmentServiceTypeUpper(seg, dbData);
				if (serviceType != "F") {
					allOperatingAreFreighter = false;
					break;
				}
			}
			if (!allOperatingAreFreighter) {
				break;
			}
		}
		return (sawOperating && allOperatingAreFreighter) ? "F" : "J";
	}();

	const bool matchServiceType = _flightServiceType.empty() || _flightServiceType == pairingServiceType;

	const bool matchFleet = [&]() -> bool {
		if (_flightFleets.empty()) {
			return true;
		}
		bool sawOperating = false;
		bool allOperatingInAllowed = true;
		for (auto* duty : duties) {
			if (duty == nullptr) {
				continue;
			}
			for (auto* seg : duty->getSegmentsRead()) {
				if (seg == nullptr || !seg->getIsOperating()) {
					continue;
				}
				sawOperating = true;
				const std::string fleet = ResolveSegmentFleetCode(seg, dbData);
				if (fleet.empty() || std::find(_flightFleets.begin(), _flightFleets.end(), fleet) == _flightFleets.end()) {
					allOperatingInAllowed = false;
					break;
				}
			}
			if (!allOperatingInAllowed) {
				break;
			}
		}
		return !sawOperating || allOperatingInAllowed;
	}();

	return matchFleet && matchServiceType;
}

bool MinScheDaysOffAtBaseForSQRuleParam::MatchParam(const Pairing* pairing) const {

	if (!MatchPairingLength(pairing)) {
		return false;
	}

	if (!MatchFlightFleetAndServiceType(pairing)) {
		return false;
	}

	return true;
}


