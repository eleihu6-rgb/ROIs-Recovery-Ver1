#pragma once

#include <cmath>
#include <cfloat>
#include<limits>

class NumberUtils {

public:

    //四舍五入
    template <typename T>
    inline static T Round(const T v)
    {
        return ((v < T(0)) ? std::ceil(v - T(0.5)) : std::floor(v + T(0.5)));
    }

    //向上取整
	template <typename T>
    inline static int Ceil(const T v) {
        double num = (double)v;
        double rounded_num = std::round(num);
        //double epsilon = std::numeric_limits<double>::epsilon();
        double epsilon = 0.0000001;
        double gap = fabs(rounded_num - num);

        if (gap > 0 && gap < epsilon) {
            //不可以接受的误差值。若 (num > rounded_num) 误差值比原始值偏大，否则 误差值比原始值偏小
            num = (num > rounded_num) ? std::floor(num) : std::ceil(num);
        }
        else {
            //可以接受的误差值
            num = std::ceil(num);
        }
        return (int)num;
    }

    //向下取整
    template <typename T>
    inline static int Floor(const T v) {
        double num = (double)v;
        double rounded_num = std::round(num);
        //double epsilon = std::numeric_limits<double>::epsilon();
        double epsilon = 0.0000001;
        double gap = fabs(rounded_num - num);

        if (gap > 0 && gap < epsilon) {
            //不可以接受的误差值。若 (num > rounded_num) 误差值比原始值偏大，否则 误差值比原始值偏小
            num = (num > rounded_num) ? std::floor(num) : std::ceil(num);
        }
        else {
            //可以接受的误差值
            num = std::floor(num);
        }
        return (int)num;
    }

    //浮点数等于0，a==0
    inline static bool Zero(double a, const double epsilon = DBL_EPSILON)
    {
        return fabs(a) <= epsilon;
    }

    //a == b
    inline static bool Equal(const double a, const double b, const double epsilon = DBL_EPSILON)
    {
        return fabs(a - b) <= epsilon;
    }

    //a < b
    inline static bool LessThan(double a, double b, const double epsilon = DBL_EPSILON)
    {
        return a < (b - epsilon);
    }

    //a <= b
    inline static bool LessThanOrEqual(double a, double b, const double epsilon = DBL_EPSILON)
    {
        return a <= (b + epsilon);
    }

    //a > b
    inline static bool GreaterThan(double a, double b, const double epsilon = DBL_EPSILON)
    {
        return a > (b + epsilon);
    }

    //a >= b
    inline static bool GreaterThanOrEqual(double a, double b, const double epsilon = DBL_EPSILON)
    {
        return a >= (b - epsilon);
    }
    
};