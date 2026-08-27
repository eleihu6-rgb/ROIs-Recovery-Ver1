/**
 * @file CheckMinConnectInDutyRuleParam.h
 * @brief
 * @author jiaxin.jin
 * @email jiaxin.jin@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/


#include <sstream>
#include <map>
#include "UtilFunc.h"
#include "Utility.h"
#include "spdlog/spdlog.h"
#include "CheckMinConnectInDutyRuleParam.h"
#include "CrewDB.h"
#include "../constant/Constants.h"
#include "../utils/BaseUtils.h"
#include "../utils/DutyUtils.h"
#include "../utils/TimeUtils.h"
#include "../utils/StringUtils.h"
#include "../utils/SegmentUtils.h"

using namespace std;

void CheckMinConnectInDutyRuleParam::ParseParam(const DBRule& dbRule) {
	RuleParam::ParseParam(dbRule);
	map<string, string>& parameter = const_cast<DBRule&>(dbRule).params;
	string header, headeValue;
	for (map<string, string>::iterator iter = parameter.begin(); iter != parameter.end(); iter++)
	{
		header = iter->first;
		headeValue = iter->second;
		if (header == "AIRPORTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _airports);
			}
		}
		else if (header == "INBOUND ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _inboundAssignments);
			}
		}
		else if (header == "INBOUND FLIGHT FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _inboundFlightFleets);
			}
		}
		else if (header == "INBOUND FLIGHT DIR") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _inboundFlightDIR);
			}
		}
		else if (header == "INBOUND SUB FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _inboundSubFleets);
			}
		}
		else if (header == "OUTBOUND ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _outboundAssignments);
			}
		}
		else if (header == "OUTBOUND ASSIGNMENTS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _outboundAssignments);
			}
		}
		else if (header == "OUTBOUND FLIGHT FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _outboundFlightFleets);
			}
		}
		else if (header == "OUTBOUND FLIGHT DIR") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _outboundFlightDIR);
			}
		}
		else if (header == "OUTBOUND SUB FLEETS") {
			if (headeValue != RuleParamConstant::ALL) {
				split(headeValue, '|', _outboundSubFleets);
			}
		}
		else if (header == "IS AIRCRAFT CHANGE") {
			if (headeValue != RuleParamConstant::ALL) {
				_isAircraftChange = headeValue;
			}
		}
		else if (header == "MCT" || header == "MIN CONN") {
			if (headeValue != RuleParamConstant::ALL) {
				_mct = hhmmStrToMinutes(headeValue);
			}
		}
		else if (header == "MAX CONN") {
			if (headeValue != RuleParamConstant::ALL) {
				_maxConn = hhmmStrToMinutes(headeValue);
			}
		}
		else if (header == "TYPE") {
			if (headeValue != RuleParamConstant::ALL) {
				_type = headeValue;
			}
		}
		else
			Logger::getRuleLogger()->error("Rule Param parsing error at idRule:{}, idRuleParam:{}, not found param: {}", dbRule.idRule, dbRule.idRuleParam, header);
	}
}

bool CheckMinConnectInDutyRuleParam::MatchInboundFlight(const Segment * segment) const {
	if (!_airports.empty() && _airports[0] != "*" && find(_airports.begin(), _airports.end(), segment->getArrStation()) == _airports.end())
		return false;
	
	if (!_inboundAssignments.empty() && _inboundAssignments[0] != "*" && find(_inboundAssignments.begin(), _inboundAssignments.end(), segment->getAssignment()) == _inboundAssignments.end())
		return false;

	if (!_inboundFlightFleets.empty() && _inboundFlightFleets[0] != "*" && find(_inboundFlightFleets.begin(), _inboundFlightFleets.end(), segment->getFleetCD()) == _inboundFlightFleets.end())
		return false;

	if (!_inboundFlightDIR.empty() && _inboundFlightDIR[0] != "*" && find(_inboundFlightDIR.begin(), _inboundFlightDIR.end(), segment->getDomIntType()) == _inboundFlightDIR.end())
		return false;

	if (!_inboundSubFleets.empty() && _inboundSubFleets[0] != "*" && find(_inboundSubFleets.begin(), _inboundSubFleets.end(), segment->getSubFleet()) == _inboundSubFleets.end())
		return false;
	
	return true;
}

bool CheckMinConnectInDutyRuleParam::MatchOutboundFlight(const Segment* segment) const {
	if (!_outboundAssignments.empty() && _outboundAssignments[0] != "*" && find(_outboundAssignments.begin(), _outboundAssignments.end(), segment->getAssignment()) == _outboundAssignments.end())
		return false;

	if (!_outboundFlightFleets.empty() && _outboundFlightFleets[0] != "*" && find(_outboundFlightFleets.begin(), _outboundFlightFleets.end(), segment->getFleetCD()) == _outboundFlightFleets.end())
		return false;

	if (!_outboundFlightDIR.empty() && _outboundFlightDIR[0] != "*" && find(_outboundFlightDIR.begin(), _outboundFlightDIR.end(), segment->getDomIntType()) == _outboundFlightDIR.end())
		return false;

	if (!_outboundSubFleets.empty() && _outboundSubFleets[0] != "*" && find(_outboundSubFleets.begin(), _outboundSubFleets.end(), segment->getSubFleet()) == _outboundSubFleets.end())
		return false;

	return true;
}

bool CheckMinConnectInDutyRuleParam::MatchAircraftChange(const Segment* segment1, const Segment* segment2) const {
	if (_isAircraftChange.empty() || _isAircraftChange == "*")
		return true;

	//7273: 有tailnumber情况下，优先判断tail number，然后才是next Leg
	if (!segment1->getTailNum().empty() && !segment2->getTailNum().empty()) {
		if (segment1->getTailNum() == segment2->getTailNum())
			return _isAircraftChange == "N";
		else
			return _isAircraftChange == "Y";
	}

	if (!segment1->getRegister().empty() && !segment2->getRegister().empty()) {
		if (segment1->getRegister() == segment2->getRegister())
			return _isAircraftChange == "N";
		else
			return _isAircraftChange == "Y";
	}

	if (((segment1->getNextLegNo() == segment2->getSegNumber() && 
		!segment1->getNextLegNo().empty() && !segment2->getSegNumber().empty())))
		return _isAircraftChange == "N";
	return _isAircraftChange == "Y";
}

bool CheckMinConnectInDutyRuleParam::CheckConnTime(const int conn) const {
	if (_mct > 0 && conn < _mct)
		return false;
	if (_maxConn > 0 && _maxConn < conn)
		return false;

	return true;
}