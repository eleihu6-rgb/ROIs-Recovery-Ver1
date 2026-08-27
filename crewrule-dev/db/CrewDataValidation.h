#pragma once

#include <string>
#include <memory>
#include <tuple>

using namespace std;

const int DEFAULT_DOM_DUTY_PICKUP_IN_SECS = 0; //Duty默认国内航班Pickup时长(单位秒)
const int DEFAULT_DOM_DUTY_BRIEF_IN_SECS = 2700; //Duty默认国内航班Brief时长(单位秒) 2700秒=45分钟

const int DEFAULT_INT_DUTY_PICKUP_IN_SECS = 0; //Duty默认国际航班Pickup时长(单位秒)
const int DEFAULT_INT_DUTY_BRIEF_IN_SECS = 3600; //Duty默认国际航班Brief时长(单位秒) 60分钟

const int DEFAULT_DOM_SEGMENT_PICKUP_IN_SECS = 0; //Segment默认国内航班Pickup时长(单位秒)
const int DEFAULT_DOM_SEGMENT_BRIEF_IN_SECS = 900; //Segment默认国内航班Brief时长(单位秒) 900秒=15分钟

const int DEFAULT_INT_SEGMENT_PICKUP_IN_SECS = 0; //Segment默认国际航班Pickup时长(单位秒)
const int DEFAULT_INT_SEGMENT_BRIEF_IN_SECS = 900; //Segment默认国际航班Brief时长(单位秒) 900秒=15分钟

const int MAX_BRIEF_IN_SECS = 86400; //最大签到时长(单位秒) 86400=1天

class CrewDataContext;
class Pairing;
class Duty;
class PairingDutyNode;

void fixPairingDuty(CrewDataContext* dbData);

void fixPairingDuty(std::shared_ptr<CrewDataContext>& dbData);

void fixPairingDuty(Pairing* pairing);

/*
* 针对错误PairingDutyNode, 进行修正返回修正后的PairingDutyNode
* @return tuple<startUtc,endUtc,startLoc,endLoc>
*/
std::tuple<time_t, time_t, time_t, time_t>  getFixedDutyNodeTime(Duty* duty, shared_ptr<PairingDutyNode>& pairingDutyNode);



