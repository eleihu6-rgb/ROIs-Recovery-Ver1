/**
 * @file LimitAircraftChangeAndConnectionParam.h
 * @brief
 * @author xuedong.he
 * @email xuedong.he@pi-solution.com
 * @version 1.0
 * @date 2023-11-02
**/

#ifndef _LIMITAIRCRAFTCHANGEANDCONNECTIONPARAM_H_
#define _LIMITAIRCRAFTCHANGEANDCONNECTIONPARAM_H_

#include "CrewDB.h"
#include "violationcollector/ViolationTypeDefine.h"
#include "RuleSystemDefine.h"
#include "RuleParam.h"
#include <string>
#include <limits>


class TransitAndLayoverRuleParam;
class LimitTransitAndLayoverRule;

class LimitAircraftChangeAndConnectionParam : public RuleParam {
	friend class TransitAndLayoverRuleParam;
	friend class LimitTransitAndLayoverRule;
private:
    explicit LimitAircraftChangeAndConnectionParam(const Rule* rule) :RuleParam(rule) {};

    constexpr static unsigned int RuleFuncId = 6019;
    constexpr static char delimInParam = ',';
    constexpr static short totalNumParam = 7;

    enum class ParamLocation {
		PAIRING_BASES = 0,
		TRANSIT_AIRPORTS = 1,
		IS_AC_CHG = 2,
		MIN_CONNECTION = 3,
		MAX_CONNECTION = 4,
		CHECK_GROUP = 5,
		SEVERITY = 6
    };

	//任务环基地列表,支持*通配
	std::string _strPairingBases{};
	vector<std::string> _pairingBases{};
	//允许长中转机场列表,支持*通配
	std::string _strTransitAirports{};
	vector<std::string> _transitAirports{};
	//长中转是否允许换飞机（Y/N）,Y/N
	std::string _strIsAcChg{};
	std::shared_ptr<bool> _isAcChg{nullptr};
	//中转允许最低时间(分钟数）,格式：HH:mm
	std::string _minConnection{};
	int _minConnectionMinutes{};
	//中转允许最大时间(分钟数）,格式：HH:mm
	std::string _maxConnection{};
	int _maxConnectionMinutes{};
	//检查组，需要检查同组规则，同组任一一条满足则表示满足
	std::string _strCheckGroups{};
	vector<std::string> _checkGroups{};

    void ParseParam(const std::string& paramString);

	void ParseParam(const DBRule& dbRule);

	//判断是否满足所在基地条件
	bool MatchPairingHomeBase(const Segment& segment, const std::string& base) const;

	//判断是否可以进行中转的机场
	bool MatchTransitAirports(const Segment& segment) const;

	//判断长中转是否允许换飞机
	bool MatchAcChgAllowed(const Segment& currSegment, const Segment& nextSegment) const;

	//检查连接时间是否满足
	bool CheckConnectionTime(const Segment& currSegment, const Segment& nextSegment) const;

public:
	enum class WarnCode {
		NO_WARN = 0, //无告警
		AC_CHG_WARN = 1, //更换飞机不满足告警
		CONNECTION_WARN = 2 //中转时间不满足告警
	};

	//匹配是否满足参数
	bool MatchParam(const Segment& currSegment, const Segment& nextSegment, const std::string& base) const;

	//检查是否满足参数
	WarnCode CheckParam(const Segment& currSegment, const Segment& nextSegment) const;

};

#endif //_LIMITAIRCRAFTCHANGEANDCONNECTIONPARAM_H_
