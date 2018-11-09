import * as React from 'react'
import { translate } from 'react-i18next'
import { I18nProps } from '@models'
import { Header, Card, Row, Col, Icon } from '@components'
import * as d3 from 'd3'
import './style.scss'
import { getTrafficStreamReader } from '@lib/request'

enum TrafficType {
    'UP' = 'UP',
    'DOWN' = 'DOWN'
}
enum SpeedType {
    'MB' = 'MB',
    'KB' = 'KB',
    'B' = 'B'
}
class Overview extends React.Component<I18nProps, {}> {
    downSpeeds: number[] = []
    upSpeeds: number[] = []
    state = {
        trafficType: TrafficType.UP,
        upSpeed: {
            speed: 0,
            type: 'B'
        },
        downSpeed: {
            speed: 0,
            type: 'B'
        }
    }
    private streamReader = null
    private chartProps = {
        duration: 1000,
        n: 20,
        height: 120,
        width: 0,
        lastData: 0,
        sourceData: []
    }
    async componentDidMount () {
        this.streamReader = await getTrafficStreamReader()
        this.initialData()
        this.streamReader.subscribe('data', (data) => {
            const [{ up, down }] = data
            const formatUp = this.formatSpeed(up)
            const formatDown = this.formatSpeed(down)
            this.setState({
                upSpeed: formatUp,
                downSpeed: formatDown
            })
            if (this.state.trafficType === TrafficType.UP) {
                this.chartProps.lastData = up
            } else {
                this.chartProps.lastData = down
            }
        })
        this.chartProps.width = (this.refs.charts as HTMLElement).offsetWidth
        this.initCharts()
    }

    componentWillUnmount () {
        this.streamReader.unsubscribe('data')
    }

    initialData = () => {
        const n = this.chartProps.n
        const initialData = this.streamReader.buffer().map(i => this.state.trafficType === TrafficType.UP ? i.up : i.down)
        while (initialData.length < n) initialData.unshift(0)
        this.chartProps.sourceData = initialData.slice(-n)
    }

    handleTrafficTypeClick = () => {
        this.setState({
            trafficType: this.state.trafficType === TrafficType.UP ? TrafficType.DOWN : TrafficType.UP
        }, () => {
            this.initialData()
        })
    }

    formatSpeed (speed: number) {
        const KB = 1024
        const MB = 1024 * 1024
        const result = {
            speed,
            type: SpeedType.B
        }
        if (speed > 0.8 * MB) {
            result.speed /= MB
            result.type = SpeedType.MB
        } else if (speed > KB) {
            result.speed /= KB
            result.type = SpeedType.KB
        }
        return result
    }
    formatByType (data: number, type: SpeedType) {
        const KB = 1024
        const MB = 1024 * 1024
        if (type === SpeedType.MB) return data / MB
        if (type === SpeedType.KB) return data / KB
        return data
    }
    initCharts = () => {
        const { width, height } = this.chartProps

        const svg = d3.select('#charts')
            .append('svg')
            .attr('width', width)
            .attr('height', height)

        const g = svg.append('g')
            .attr('class', 'contain')

        svg.append('defs')
            .append('clipPath')
            .attr('id', 'clip')
            .append('rect')
            .attr('width', width)
            .attr('height', height)

        // area path
        g.append('g')
            .attr('clip-path', 'url(#clip)')
            .append('path')
            .attr('class', 'area')

        // line path
        g.append('g')
            .attr('clip-path', 'url(#clip)')
            .append('path')
            .attr('class', 'line')

        this.chartRender()
    }

    chartRender = () => {
        const { duration, n, height, width } = this.chartProps

        // d3 transition
        let transition = d3
            .transition()
            .duration(duration)
            .ease(d3.easeLinear)

        // now timestamp
        let now = +new Date() - duration

        // format x value
        const xScale = d3.scaleTime()
            .domain([now - (n - 2) * duration, now - duration])
            .range([0, width])

        // format y value
        const yScale = d3.scaleLinear()
            .rangeRound([height, 0])
            .domain([0, 200])

        const area = d3.area()
            .x((d, i) => xScale(now - (n - 1 - i) * duration))
            .y0(height)
            .y1(yScale)
            .curve(d3.curveBasis)

        let line = d3.line()
            .x((d, i) => xScale(now - (n - 1 - i) * duration))
            .y(yScale)
            .curve(d3.curveBasis)
        const tick = () => {
            transition = transition
                .each(() => {
                    // update the domains
                    now = +new Date()
                    xScale.domain([now - (n - 2) * duration, now - duration])

                    // update data
                    this.chartProps.sourceData.push(this.chartProps.lastData)

                    // reset data
                    this.chartProps.lastData = 0

                    // get maxSpeed and type
                    const maxSpeed = d3.max(this.chartProps.sourceData)
                    const { speed, type } = this.formatSpeed(maxSpeed)

                    // get data by type
                    const data = this.chartProps.sourceData.map(i => this.formatByType(i, type))

                    // set yScale by max speed
                    yScale.domain([0, speed])

                    // Redraw the line
                    d3.select('.line')
                        .data([data])
                        .attr('d', line)
                        .attr('transform', null)
                    // slide the line left
                    d3.select('.line')
                        .transition(transition)
                        .attr('transform', `translate(${xScale(now - (n - 1) * duration)})`)

                    // Redraw the area.
                    d3.select('.area')
                        .data([data])
                        .attr('d', area)
                        .attr('transform', null)

                    // slide the area left
                    d3.select('.area')
                        .transition(transition)
                        .attr('transform', `translate(${xScale(now - (n - 1) * duration)})`)
                    this.chartProps.sourceData.shift()
                })
                .transition()
                .on('start', tick)
        }
        tick()
    }
    render () {
        const { t } = this.props
        const { speed: downSpeed, type: downType } = this.state.downSpeed
        const { speed: upSpeed, type: upType } = this.state.upSpeed
        return (
            <div className="page">
                <Header title={t('title')}></Header>
                <Row gutter={24} align="middle">
                    <Col span={12}>
                        <Card className="traffic-card">
                            <Row className="traffic-header">
                                <Col span={5} offset={1} className="type-select">
                                    <div onClick={this.handleTrafficTypeClick}>
                                        { this.state.trafficType === 'UP' ? '上行' : '下行' }
                                        <Icon type={ this.state.trafficType === TrafficType.UP ? 'triangle-up' : 'triangle-down' } className="speed-icon"/>
                                    </div>
                                </Col>
                                <Col span={6} offset={6} className="speed-info">
                                    <Icon type="triangle-up" className="speed-icon"/>
                                    {upSpeed.toString().slice(0, 3)}{upType}/s
                                </Col>
                                <Col span={6} className="speed-info">
                                    <Icon type="triangle-down" className="speed-icon"/>
                                    {downSpeed.toString().slice(0, 3)}{downType}/s
                                </Col>
                            </Row>
                            <div id="charts" ref="charts"></div>
                        </Card>
                    </Col>
                </Row>
            </div>
        )
    }
}

export default translate(['Overview'])(Overview)
