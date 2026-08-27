/**
 * @file ViolationTypeDefine.h
 * @brief 
 * @author Yuhao Wang
 * @email yuhao.wang(at)pi-solution.com
 * @version 1.0
 * @date 2023-08-18
**/


#ifndef NEWRULEENGINE_VIOLATIONTYPEDEFINE_H
#define NEWRULEENGINE_VIOLATIONTYPEDEFINE_H
#include <climits>
enum class ViolationType: unsigned char {
    CREW        = 'C',
    ROSTER      = 'R',
    PAIRING     = 'P',
    DUTY        = 'D',
    FLIGHT      = 'F',
    SWAP        = 'S'
};

enum class ViolationSeverity: unsigned char {
    NOTICE      = 0,
    WARNING     = 1,
    LOW         = 2,
    MEDIUM      = 3,
    HIGH        = 4,
    ULTRA_HIGH  = 5,
	MUTE = UCHAR_MAX
	//MUTE        = std::numeric_limits<unsigned char>::max()

};
constexpr ViolationSeverity DefaultSeverity = ViolationSeverity::LOW;

#endif //NEWRULEENGINE_VIOLATIONTYPEDEFINE_H
