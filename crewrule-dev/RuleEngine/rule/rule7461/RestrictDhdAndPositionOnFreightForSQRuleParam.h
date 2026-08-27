#ifndef _RESTRICTDHDANDPOSITIONONFREIGHTFORSQRULEPARAM_H_
#define _RESTRICTDHDANDPOSITIONONFREIGHTFORSQRULEPARAM_H_

#include <string>
#include <vector>

#include "CrewDB.h"
#include "RuleParam.h"
#include "RuleSystemDefine.h"
#include "violationcollector/ViolationTypeDefine.h"

class RestrictDhdAndPositionOnFreightForSQRule;

class RestrictDhdAndPositionOnFreightForSQRuleParam : public RuleParam {
	friend class RestrictDhdAndPositionOnFreightForSQRule;
public:
	explicit RestrictDhdAndPositionOnFreightForSQRuleParam(const Rule* rule) : RuleParam(rule) {}

	constexpr static unsigned int RuleFuncId = 7461;
	constexpr static char delimInParam = ',';
	constexpr static short totalNumParam = 3;

	enum class ParamLocation {
		IS_HOME_BASE = 0,
		DEADHEAD_AND_POSITIONING_ASSIGNMENTS = 1,
		FREIGHT_FLEET_TYPES = 2
	};

	//是否HomeBase，取值：Y/N。配置为*或空，则默认为Y
	std::string _isHomeBase{};

	//置位的Segment任务类型列表，多个使用|分割，*表示所有。默认配置：DHD
	std::vector<std::string> _deadheadAndPositioningAssignments{};

	//货机机队代码，多个使用|分割。默认配置：77X|74Y
	std::vector<std::string> _freightFleetTypes{"77X", "74Y"};

	void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	bool MatchHomeBase(bool isAtBase) const;

	bool IsFreightFlight(const Segment* segment) const;

	bool IsPassengerFlight(const Segment* segment) const;

	bool MatchFreightDhdSegment(const Segment* segment) const;

};

#endif //_RESTRICTDHDANDPOSITIONONFREIGHTFORSQRULEPARAM_H_
